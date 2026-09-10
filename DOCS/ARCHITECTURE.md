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
units include the original text and pending indicator in the static HTML.
The page never generates translations or waits for AI during rendering.

After hydration, `TranslatedPost` calls `usePostTranslation` separately for
the title and body. Each missing unit requests `POST /api/translations/posts`
independently. The browser adapter handles HTTP;
shared Zod schemas define the request and result. The endpoint validates the
post ID, unit kind, source context, and target locale. It reads the current
public post and rejects hidden/missing posts or a changed source before any
translation lookup or generation. Prefetch requests cannot generate translations.
The endpoint owns request validation and cache invalidation; these concerns do
not belong to the generation service.

`ensureTranslation` rechecks storage without the Next.js read cache. It
claims the key atomically, generates once, and returns success only after a
token-guarded write succeeds. Other callers wait at most 95 seconds for an
existing claim. Missing data, failed generation, and unpersisted results stay
explicit; the display layer owns the original-text fallback.

After a successful write or a persisted result found behind a stale miss, the
endpoint calls `revalidateTag(tag, { expire: 0 })` for that context's pending
tag. A failed invalidation is logged without discarding the saved result.
The current browser uses the returned result directly. The next server request
rebuilds the static output from storage, and later visits can reuse it without
client translation requests. Reads that find results no longer attach pending
tags. No invalidation happens during rendering or inside `use cache`.
Time-based revalidation recovers from an interrupted or failed invalidation.

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

The client post is keyed by post, locale, and both original contexts, so
navigation or source changes reset its requests and display state. Request
hooks abort abandoned requests and ignore their results. Completed translations
update existing renderers instead of replacing Suspense fallbacks; saved
results from new server props take precedence over local request state.
Other browsers' previously cached pages are not actively invalidated.

Display behavior lives in `src/components/features/translations`, separately
from fetching. `useTranslationDisplay(results)` owns only the original/translated
choice for one content block. Availability and progress are derived from the
results; `getText(original, result)` selects the displayed text. One hook call
groups an article's title and body, while separate calls provide independent
choices for independent blocks. Later results respect the existing choice.
The owning component should use a key based on content identity, source, and
locale when those changes must reset the choice.

`TranslationToggle` is a controlled presentation component taking
`showOriginal`, `onToggle`, and `className`. It has no fetching, positioning,
or global state. Callers can place it in their own action area or use a custom
button with the same hook. The post positions it absolutely beside the existing
copy action in a fixed-height row, so adding/removing it does not move content
or change text width. Its stable label and pressed state indicate whether the
original is selected. Only the displayed content is mounted; title, body,
heading outline, and copy payload follow the same choice without a request or
locale change. Author/date/tags remain server-rendered children of the client
post.

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
