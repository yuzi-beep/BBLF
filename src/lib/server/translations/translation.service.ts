import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { connection } from "next/server";

import { CACHE_TAGS } from "#lib/server/cache";

import { generateTranslation } from "./translation-generation.service";
import { getTranslationRefresh } from "./translation-refresh.service";
import {
  claimTranslation,
  finishTranslation,
  readTranslationRows,
  storedTranslation,
} from "./translation-storage.service";
import { pendingTranslationTag, translationKey } from "./translation.helper";
import type { TranslationInput, TranslationResult } from "./translation.type";

export async function readTranslations(
  inputs: readonly TranslationInput[],
): Promise<TranslationResult[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CACHE_TAGS.translations);
  const keys = inputs.map(translationKey);
  let rows: Awaited<ReturnType<typeof readTranslationRows>> = [];
  try {
    rows = await readTranslationRows(keys);
  } catch {
    // Missing remains explicit; the request path will recheck database availability.
  }
  return keys.map((key) => {
    const result = storedTranslation(rows.find((row) => row.key === key));
    if (result.status === "missing") cacheTag(pendingTranslationTag(key));
    return result;
  });
}

export async function readTranslation(
  input: TranslationInput,
): Promise<TranslationResult> {
  return (await readTranslations([input]))[0];
}

export async function ensureTranslation(
  input: TranslationInput,
): Promise<TranslationResult> {
  await connection();
  const requestHeaders = await headers();
  if (
    requestHeaders.has("next-router-prefetch") ||
    requestHeaders.get("purpose") === "prefetch" ||
    requestHeaders.get("sec-purpose")?.includes("prefetch")
  ) {
    return { status: "unavailable" };
  }
  const refresh = getTranslationRefresh();
  const key = translationKey(input);
  const token = randomUUID();
  let claimed = false;
  const completed = (result: TranslationResult) => {
    if (result.status === "translated" || result.status === "unchanged")
      refresh(key);
    return result;
  };
  try {
    const existing = storedTranslation(
      (await readTranslationRows([key])).at(0),
    );
    if (existing.status !== "missing") return completed(existing);
    claimed = await claimTranslation(key, input, token);
    if (claimed) {
      const generated = await generateTranslation(input);
      if (await finishTranslation(key, token, generated)) {
        return completed(
          generated.status === "translated"
            ? { status: "translated", text: generated.text }
            : { status: "unchanged" },
        );
      }
      return { status: "unavailable" };
    }
    const deadline = Date.now() + 95_000;
    do {
      const row = (await readTranslationRows([key])).at(0);
      const result = storedTranslation(row);
      if (result.status !== "missing") return completed(result);
      if (
        !row ||
        row.status !== "pending" ||
        !row.lease_until ||
        Date.parse(row.lease_until) <= Date.now()
      )
        break;
      await setTimeout(500);
    } while (Date.now() < deadline);
  } catch {
    if (claimed) {
      try {
        await finishTranslation(key, token, {
          status: "failed",
          text: "",
          model: "",
        });
      } catch {
        // A later request can recover an abandoned claim after its lease expires.
      }
    }
  }
  return { status: "unavailable" };
}
