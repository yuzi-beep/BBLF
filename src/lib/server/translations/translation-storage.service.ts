import "server-only";
import { makeAdminClient } from "#lib/server/supabase.client";
import type { Database } from "#types/supabase";

import type { TranslationInput, TranslationResult } from "./translation.type";

type Row = Database["public"]["Tables"]["translation_cache"]["Row"];

export function storedTranslation(row: Row | undefined): TranslationResult {
  if (row?.status === "translated" && row.result !== null)
    return { status: "translated", text: row.result };
  if (row?.status === "unchanged") return { status: "unchanged" };
  return { status: "missing" };
}

export async function readTranslationRows(keys: readonly string[]) {
  const { data, error } = await makeAdminClient()
    .from("translation_cache")
    .select("*")
    .in("key", [...keys])
    .abortSignal(AbortSignal.timeout(5_000));
  if (error) throw error;
  return data;
}

export async function claimTranslation(
  key: string,
  input: TranslationInput,
  token: string,
) {
  const { data, error } = await makeAdminClient()
    .rpc("claim_translation", {
      p_key: key,
      p_context: input.context,
      p_target_locale: input.targetLocale,
      p_token: token,
    })
    .abortSignal(AbortSignal.timeout(5_000));
  if (error) throw error;
  return data.length > 0;
}

export async function finishTranslation(
  key: string,
  token: string,
  result: {
    readonly status: "translated" | "unchanged" | "failed";
    readonly text: string;
    readonly model: string;
  },
) {
  const { data, error } = await makeAdminClient()
    .rpc("finish_translation", {
      p_key: key,
      p_token: token,
      p_status: result.status,
      p_result: result.text,
      p_model: result.model,
    })
    .abortSignal(AbortSignal.timeout(5_000));
  if (error) throw error;
  return data;
}
