import { afterAll, beforeEach, expect, mock, test } from "bun:test";

import { serve } from "bun";

import type { Database } from "#types/supabase";

type Row = Database["public"]["Tables"]["translation_cache"]["Row"];
const rows = new Map<string, Row>();
const tags: string[] = [];
const invalidated: string[] = [];
const callbacks: (() => void)[] = [];
let requestMemo = new Map<() => unknown, unknown>();
let requestHeaders = new Headers();
let databaseAvailable = true;
let persist = true;
let calls = 0;
let reply = "你好";
let finishReason = "stop";
let responseStatus = 200;

await mock.module("server-only", () => ({}));
await mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: (...values: string[]) => tags.push(...values),
  revalidateTag: (tag: string, profile: { expire: number }) => {
    expect(profile).toEqual({ expire: 0 });
    invalidated.push(tag);
  },
}));
await mock.module("next/headers", () => ({ headers: async () => requestHeaders }));
await mock.module("next/server", () => ({
  connection: async () => {},
  after: (callback: () => void) => callbacks.push(callback),
}));
await mock.module("react", () => ({
  cache: (factory: () => unknown) => () => {
    if (!requestMemo.has(factory)) requestMemo.set(factory, factory());
    return requestMemo.get(factory);
  },
}));
await mock.module("./translation-storage.service", () => ({
  readTranslationRows: async (keys: string[]) => {
    if (!databaseAvailable) throw new Error("Database unavailable");
    return keys.flatMap((key) => (rows.has(key) ? [rows.get(key)] : []));
  },
  storedTranslation: (row: Row | undefined) =>
    row?.status === "translated"
      ? { status: "translated", text: row.result }
      : row?.status === "unchanged"
        ? { status: "unchanged" }
        : { status: "missing" },
  claimTranslation: async (
    key: string,
    input: { context: string; targetLocale: string },
    token: string,
  ) => {
    if (rows.has(key)) return false;
    rows.set(key, {
      key,
      context: input.context,
      target_locale: input.targetLocale,
      status: "pending",
      claim_token: token,
      lease_until: new Date(Date.now() + 120_000).toISOString(),
      result: null,
      model: null,
      generated_at: null,
      retry_after: null,
    });
    return true;
  },
  finishTranslation: async (
    key: string,
    token: string,
    result: { status: string; text: string; model: string },
  ) => {
    const row = rows.get(key);
    if (!persist || !row || row.claim_token !== token) return false;
    rows.set(key, {
      ...row,
      status: result.status,
      result: result.status === "failed" ? null : result.text,
      model: result.model,
    });
    return true;
  },
}));

const server = serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch() {
    calls++;
    if (responseStatus !== 200)
      return Response.json(
        { error: { message: "Controlled failure" } },
        { status: responseStatus },
      );
    return Response.json({
      choices: [
        {
          message: { role: "assistant", content: reply },
          finish_reason: finishReason,
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  },
});
const environment = {
  TRANSLATION_AI_API_KEY: process.env.TRANSLATION_AI_API_KEY,
  TRANSLATION_AI_BASE_URL: process.env.TRANSLATION_AI_BASE_URL,
  TRANSLATION_AI_MODEL: process.env.TRANSLATION_AI_MODEL,
};
const { ensureTranslation, readTranslations } =
  await import("./translation.service");
const {
  translationKey,
  pendingTranslationTag,
  needsNoTranslation,
  validTranslation,
} = await import("./translation.helper");
const input = { context: "Hello", targetLocale: "zh-CN" } as const;

beforeEach(() => {
  rows.clear();
  tags.length = 0;
  invalidated.length = 0;
  callbacks.length = 0;
  requestMemo = new Map();
  requestHeaders = new Headers();
  databaseAvailable = true;
  persist = true;
  calls = 0;
  reply = "你好";
  finishReason = "stop";
  responseStatus = 200;
  process.env.TRANSLATION_AI_API_KEY = "local-test";
  process.env.TRANSLATION_AI_BASE_URL = `${server.url}v1`;
  process.env.TRANSLATION_AI_MODEL = "local-test";
});
afterAll(() => {
  void server.stop(true);
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("raw context and locale determine stable independent keys", () => {
  expect(translationKey(input)).toMatch(/^translation:v1:[a-f0-9]{64}:zh-CN$/);
  expect(translationKey({ ...input, context: "Hello " })).not.toBe(
    translationKey(input),
  );
  expect(translationKey({ ...input, targetLocale: "en-US" })).not.toBe(
    translationKey(input),
  );
});

test("missing reads attach pending tags; persisted results refresh once after the response", async () => {
  const body = { ...input, context: "World" };
  expect(await readTranslations([input, body])).toEqual([
    { status: "missing" },
    { status: "missing" },
  ]);
  expect(tags).toEqual([
    "translation:all",
    pendingTranslationTag(translationKey(input)),
    pendingTranslationTag(translationKey(body)),
  ]);
  await Promise.all([ensureTranslation(input), ensureTranslation(body)]);
  await ensureTranslation(input);
  expect(calls).toBe(2);
  expect(callbacks).toHaveLength(1);
  expect(invalidated).toHaveLength(0);
  callbacks[0]();
  expect(new Set(invalidated).size).toBe(2);
  callbacks[0]();
  expect(invalidated).toHaveLength(2);
  tags.length = 0;
  expect(
    (await readTranslations([input, body])).every(
      (result) => result.status === "translated",
    ),
  ).toBe(true);
  expect(tags).toEqual(["translation:all"]);
});

test("a stale missing read rechecks storage without another model call and repairs its tag", async () => {
  await readTranslations([input]);
  await ensureTranslation(input);
  requestMemo = new Map();
  callbacks.length = 0;
  expect((await ensureTranslation(input)).status).toBe("translated");
  expect(calls).toBe(1);
  callbacks[0]();
  expect(invalidated).toEqual([pendingTranslationTag(translationKey(input))]);
});

test("partial failure does not discard a successful unit's refresh", async () => {
  await ensureTranslation(input);
  responseStatus = 500;
  expect((await ensureTranslation({ ...input, context: "Other" })).status).toBe(
    "unavailable",
  );
  expect(calls).toBe(2);
  callbacks[0]();
  expect(invalidated).toEqual([pendingTranslationTag(translationKey(input))]);
});

test("concurrent callers reuse one claim and generation", async () => {
  const results = await Promise.all([
    ensureTranslation(input),
    ensureTranslation(input),
    ensureTranslation(input),
  ]);
  expect(results.every((result) => result.status === "translated")).toBe(true);
  expect(calls).toBe(1);
});

test("unpersisted results never become successful output or refresh tags", async () => {
  persist = false;
  expect((await ensureTranslation(input)).status).toBe("unavailable");
  callbacks[0]();
  expect(invalidated).toEqual([]);
});

test("unavailable database and missing configuration do not invoke AI", async () => {
  databaseAvailable = false;
  expect((await ensureTranslation(input)).status).toBe("unavailable");
  databaseAvailable = true;
  delete process.env.TRANSLATION_AI_API_KEY;
  expect((await ensureTranslation(input)).status).toBe("unavailable");
  expect(calls).toBe(0);
});

test("prefetch requests never generate", async () => {
  requestHeaders.set("next-router-prefetch", "1");
  expect((await ensureTranslation(input)).status).toBe("unavailable");
  expect(calls).toBe(0);
  expect(rows.size).toBe(0);
});

test.each(["length", "content-filter", "error"])(
  "incomplete finish reason %s is not persisted as success",
  async (reason) => {
    finishReason = reason;
    expect((await ensureTranslation(input)).status).toBe("unavailable");
    expect(rows.get(translationKey(input))?.status).toBe("failed");
    callbacks[0]();
    expect(invalidated).toEqual([]);
  },
);

test("empty and structurally damaged outputs fail; identical output is unchanged", async () => {
  reply = "";
  expect((await ensureTranslation(input)).status).toBe("unavailable");
  rows.clear();
  reply = "Hello";
  expect(await ensureTranslation(input)).toEqual({ status: "unchanged" });
  callbacks[0]();
  expect(invalidated).toEqual([pendingTranslationTag(translationKey(input))]);
});

test("Markdown code, destinations, GFM and directive structure remain intact", () => {
  const source =
    '## Hello\n\n[Link](https://example.com) and `code`\n\n```js\nconst x = 1;\n```\n\n- [x] Done\n\n| A | B |\n| - | - |\n| C | D |\n\n::card{title="Keep" tone="info"}';
  const output = source
    .replace("Hello", "你好")
    .replace("Link", "链接")
    .replace("Done", "完成");
  expect(validTranslation(source, output)).toBe(true);
  for (const damaged of [
    output.replace("example.com", "evil.test"),
    output.replace("const x = 1", "const x = 2"),
    output.replace('tone="info"', 'tone="error"'),
    output.replace("##", "###"),
    output.replace("[x]", "[ ]"),
    output.split("\n\n").slice(0, -1).join("\n\n"),
  ])
    expect(validTranslation(source, damaged)).toBe(false);
});

test("short and mixed text require translation; code does not influence detection", () => {
  expect(needsNoTranslation({ ...input, context: "你好" })).toBe(false);
  const english =
    "This is a detailed article about the design of a search experience. The reader should be able to find the information they need without unnecessary steps or complicated interactions.";
  expect(needsNoTranslation({ context: english, targetLocale: "en-US" })).toBe(
    true,
  );
  expect(
    needsNoTranslation({ context: `${english} 中文`, targetLocale: "en-US" }),
  ).toBe(false);
  expect(
    needsNoTranslation({
      context: `\`\`\`\n${english}\n\`\`\``,
      targetLocale: "en-US",
    }),
  ).toBe(false);
  const simplified =
    "这篇文章介绍如何设计清晰易用的搜索界面，让读者快速找到需要的信息。我们需要关注搜索过程中的每一个细节，减少不必要的操作，并提供明确的反馈。只有认真理解读者的实际需求，才能持续改善网站的使用体验，让信息查找变得更加简单方便。";
  expect(
    needsNoTranslation({ context: simplified, targetLocale: "zh-CN" }),
  ).toBe(true);
  expect(
    needsNoTranslation({
      context: simplified.replace("这篇文章", "這篇文章"),
      targetLocale: "zh-CN",
    }),
  ).toBe(false);
});
