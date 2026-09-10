# Architecture

## Data and Authorization

Shared services contain reusable queries and accept a Supabase client so the
caller selects the appropriate identity:

| Client              | Use                                                      |
| ------------------- | -------------------------------------------------------- |
| `makeStaticClient`  | Anonymous public reads.                                  |
| `makeBrowserClient` | Browser session reads and mutations.                     |
| `makeServerClient`  | Cookie-backed server session access.                     |
| `makeAdminClient`   | Privileged server operations using the service-role key. |

The dashboard layout controls navigation and sign-in access. Database RLS and
authorization checks in privileged endpoints protect the underlying operations;
hiding an admin link is not authorization.

## Cache Invalidation

Public data uses `"use cache"` with tags defined in
`src/lib/server/cache/index.ts`. Lists, summaries, config, and individual posts
have separate tags so updates invalidate only their consumers.

Supabase changes reach `/api/webhook`, which validates the bearer secret and
payload, maps tables to tags, and revalidates with stale-while-revalidate behavior.
Post changes also invalidate the individual post tag. The admin-only
`/api/admin/cache/revalidate-all` endpoint expires all known content tags
immediately. These paths and cached consumers share the same tag definitions.

## Post Translation Preview

`/[locale]/translation-preview/posts/[id]` reads only public posts through the
existing anonymous query and post cache tag. It generates static parameters
for public posts and marks original-only metadata `noindex`. Neither the posts
table nor the existing post route, navigation, or webhook changes for this pilot.

`src/lib/server/translations` is server-only. Its input is just the original
`context` and `targetLocale`; callers do not supply a post ID, source language,
or content format. A title and a complete body are separate contexts. The
persistent key is `translation:v1:{SHA256(raw context)}:{targetLocale}`.

`readTranslation`/`readTranslations` only read. Batch reads run in `use cache`
with `cacheLife("minutes")` and the maintenance tag `translation:all`. Each
missing result adds `translation:pending:{translationKey}`. Saved translations
and explicit `unchanged` results participate in prerendering, while missing
units render their original text and pending indicator as independent Suspense
fallbacks.
The Suspense boundaries remain mounted for saved results too, so a cached shell
and its resumed render keep the same boundary structure after invalidation.

`ensureTranslation` waits for `connection()` outside the cache scope, rejects
prefetch generation, and rechecks storage without the Next.js read cache. It
claims the key atomically, generates once, and returns success only after a
token-guarded write succeeds. Other callers wait at most 95 seconds for an
existing claim. Missing data, failed generation, and unpersisted results stay
explicit; the display layer owns the original-text fallback.

A React `cache` factory creates one refresh collector per request. It owns a
`Set` of pending tags and registers one `after()` callback. Successful writes
and already-persisted results found behind a stale miss add their pending tag.
After the response, each collected tag is expired with
`revalidateTag(tag, { expire: 0 })`; a failed invalidation does not stop the
others, and the set is cleared afterward. No invalidation happens during
rendering or inside `use cache`. There is no process-global completion flag,
database refresh marker, or translation webhook. Subsequent requests rebuild
the cache; reads that find results no longer attach pending tags. Time-based
revalidation is the recovery path if this callback is interrupted or fails.

`translation_cache` has RLS and service-role-only table/RPC grants, no post
foreign key, and no automatic TTL for successful results. Claim tokens and a
120-second lease prevent concurrent writers; only the current unexpired token
can finish. Failed work has a 30-second cooldown. If the database cannot be read
or claimed, no AI request is made. A later visit can recover an expired lease;
this is request-bound work, not a durable background queue.

Language detection uses natural-language Markdown text, image alternative text,
and link titles, excluding code and destinations. Conservative `franc-min`
matches can skip generation; `opencc-js` also checks simplified Chinese.
Otherwise the AI SDK calls an OpenAI-compatible Chat Completions endpoint with
a 90-second timeout and no retries. Markdown AST comparisons protect code,
link targets, GFM structure, and directive names/attributes. Empty output,
non-`stop` completions, and damaged structure fail. This is limited structural
validation, not a guarantee of semantic accuracy or complete format support.

Each client translation unit mounts only its displayed version. Its local
toggle updates the body renderer, heading outline, and copy payload together
without a request or locale change. Other browsers' previously cached pages
are not actively invalidated.

## Internationalization

`#i18n` uses conditional exports in `package.json`: Server Components read
route locale and cached dictionaries; Client Components read the serialized
dictionary from `I18nProvider`. This lets shared synchronous components use the
same translation API without forcing them into the client bundle. Async server
code uses `getT` or `getScopedT`.

The ICU translator receives its dictionary and locale explicitly. Dictionary
validation belongs to i18n; config owns storage and overrides. The shared i18n
entrypoint excludes dictionary data and schemas to keep them out of client
imports. Dictionary caches use the config tag, so configuration changes also
invalidate translations.

## Content Rendering

`content-renderer.component.tsx` combines Markdown/GFM parsing, custom directive
transforms, heading IDs, and syntax highlighting. The directive registry under
`src/components/features/content/_components/directive-render` connects parsed
nodes to their renderers; new directives need both registration and rendering.

`pre-render.component.tsx` handles code blocks and PlantUML output. PlantUML source is sent
to a public rendering service; supported content syntax is documented in the
[README](../README.md#markdown-support).

## Module Ownership

Files use `subject.role.ts(x)` as described in `AGENTS.md`. Existing index
entrypoints, framework files, generated icons and database types, locale files,
and maintenance scripts retain their established names.

Page-level hooks live in each route's `_hooks`; editor-private hooks stay beside
their editor. Reusable presentation primitives and the modal system belong to
`components/ui`. Locale-aware links and global toast handling belong to
`components/shared`; the public footer belongs to the public layout.

The client, server, and shared data layers remain separate. Supabase factories
are named `supabase.client.ts` within each layer. Shared session queries live in
`lib/shared/auth/session.service.ts` and receive the caller's Supabase client.
Browser image compression and uploads live in `lib/client/images`; shared image
services provide storage queries and deletion without importing browser code.

Search transformations and types live in `lib/shared/search`, while browser RPC
calls stay in client services. Theme constants, types, and transformations live
in `lib/shared/theme`, with Jotai state in `lib/client/theme.atom.ts`. Route
constants and localized route transformations live in `lib/shared/routes`.
Date conversion, file-size formatting, and hashing are separate shared utilities;
date utilities retain the existing timezone initialization and fallback behavior.
