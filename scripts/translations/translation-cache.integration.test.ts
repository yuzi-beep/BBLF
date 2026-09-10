import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import postgres from "postgres";

const databaseUrl = process.env.TRANSLATION_TEST_DB_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port === "54322"
  ) {
    throw new Error(
      "Translation integration tests require an isolated loopback database on a non-default port",
    );
  }
}
const sql = databaseUrl ? postgres(databaseUrl) : undefined;
const keys: string[] = [];
afterAll(async () => {
  if (!sql) return;
  if (keys.length)
    await sql`delete from public.translation_cache where key in ${sql(keys)}`;
  await sql.end();
});

test.skipIf(!sql)(
  "atomic claims, stale tokens, cooldown, lease recovery and durable results",
  async () => {
    if (!sql) return;
    const key = `integration:${randomUUID()}`;
    keys.push(key);
    const tokens = Array.from({ length: 8 }, () => randomUUID());
    const claims = await Promise.all(
      tokens.map(
        (token) =>
          sql`select * from public.claim_translation(${key}, 'Hello', 'zh-CN', ${token})`,
      ),
    );
    expect(claims.filter((claim) => claim.length === 1)).toHaveLength(1);
    const winner = tokens[claims.findIndex((claim) => claim.length === 1)];
    const loser = tokens.find((token) => token !== winner)!;
    expect(
      (
        await sql`select public.finish_translation(${key}, ${loser}, 'translated', '你好', 'test') as ok`
      )[0].ok,
    ).toBe(false);
    expect(
      (
        await sql`select public.finish_translation(${key}, ${winner}, 'failed', '', 'test') as ok`
      )[0].ok,
    ).toBe(true);
    expect(
      await sql`select * from public.claim_translation(${key}, 'Hello', 'zh-CN', ${loser})`,
    ).toHaveLength(0);
    const [cooldown] =
      await sql`select extract(epoch from (retry_after - clock_timestamp())) as remaining from public.translation_cache where key = ${key}`;
    expect(Number(cooldown.remaining)).toBeGreaterThan(25);
    await sql`update public.translation_cache set retry_after = clock_timestamp() - interval '1 second' where key = ${key}`;
    expect(
      await sql`select * from public.claim_translation(${key}, 'Hello', 'zh-CN', ${loser})`,
    ).toHaveLength(1);
    await sql`update public.translation_cache set lease_until = clock_timestamp() - interval '1 second' where key = ${key}`;
    expect(
      (
        await sql`select public.finish_translation(${key}, ${loser}, 'translated', '你好', 'test') as ok`
      )[0].ok,
    ).toBe(false);
    expect(
      await sql`select * from public.claim_translation(${key}, 'Hello', 'zh-CN', ${winner})`,
    ).toHaveLength(1);
    expect(
      (
        await sql`select public.finish_translation(${key}, ${loser}, 'translated', '你好', 'test') as ok`
      )[0].ok,
    ).toBe(false);
    expect(
      (
        await sql`select public.finish_translation(${key}, ${winner}, 'translated', '你好', 'test') as ok`
      )[0].ok,
    ).toBe(true);
    expect(
      await sql`select * from public.claim_translation(${key}, 'Hello', 'zh-CN', ${loser})`,
    ).toHaveLength(0);
    const [saved] =
      await sql`select * from public.translation_cache where key = ${key}`;
    expect(saved.result).toBe("你好");
    expect(saved.generated_at).not.toBeNull();
    expect(saved.lease_until).toBeNull();
  },
);

test.skipIf(!sql)(
  "RLS and privileges exclude anon/authenticated and allow service-role RPCs",
  async () => {
    if (!sql) return;
    const [table] =
      await sql`select relrowsecurity from pg_class where oid = 'public.translation_cache'::regclass`;
    expect(table.relrowsecurity).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      const [permissions] =
        await sql`select has_table_privilege(${role}, 'public.translation_cache', 'SELECT') as read,
      has_function_privilege(${role}, 'public.claim_translation(text,text,text,uuid)', 'EXECUTE') as claim,
      has_function_privilege(${role}, 'public.finish_translation(text,uuid,text,text,text)', 'EXECUTE') as finish`;
      expect(permissions).toEqual({ read: false, claim: false, finish: false });
    }
    const [service] =
      await sql`select has_function_privilege('service_role', 'public.claim_translation(text,text,text,uuid)', 'EXECUTE') as claim`;
    expect(service.claim).toBe(true);
  },
);
