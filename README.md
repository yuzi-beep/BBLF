# Personal Site

A personal site and lightweight CMS built with Next.js 16, React 19, Supabase, and Tailwind CSS 4.

It includes a public-facing site for posts, thoughts, and events, plus a locale-aware dashboard for content, tags, images, config, and account management.

## Features

- Public pages for posts, thoughts, and events
- Dashboard for managing posts, thoughts, events, tags, images, site config, and account info
- Supabase-backed auth, database, and storage
- Locale-aware routing with `en-US` and `zh-CN`
- Markdown rendering with GFM, syntax highlighting, heading anchors, and custom directives
- PlantUML code block rendering through the public PlantUML server
- Click-to-open image preview
- Cache revalidation webhook for content updates

## Tech Stack

- [Next.js 16](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/)
- [react-markdown](https://github.com/remarkjs/react-markdown)
- [remark-gfm](https://github.com/remarkjs/remark-gfm)
- [remark-directive](https://github.com/remarkjs/remark-directive)
- [rehype-prism-plus](https://github.com/timlrx/rehype-prism-plus)
- [Framer Motion](https://www.framer.com/motion/)
- [Lucide React](https://lucide.dev/)
- [Bun](https://bun.sh/) for local scripts and package management

## Prerequisites

- Node.js 20.9+
- Bun
- Database access: Docker Desktop (or another Docker-compatible runtime) for
  local development, a Supabase project for remote development, or both

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/muyu258/personal-site.git
cd personal-site
```

### 2. Install dependencies

```bash
bun install
```

### 3. Start the local database

Make sure Docker Desktop is running, then run:

```bash
bun run supabase:setup
```

This starts the local Supabase services and writes the local API URL, anon key,
and service-role key to `.env.development`. Existing non-Supabase values in that
file are preserved.

### 4. Configure environment variables

If you used `bun run supabase:setup`, this mapping is done automatically. The
values come from `bunx supabase status`:

- API URL to `NEXT_PUBLIC_SUPABASE_URL`
- anon key to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- service role key to `SUPABASE_SERVICE_ROLE_KEY`
- any private local value to `WEBHOOK_SECRET`

`NEXT_PUBLIC_APP_TIMEZONE` is optional.
Edit `.env.development` to set `WEBHOOK_SECRET` and any optional application values.
The file is ignored by Git.

Supabase Studio is available at [http://localhost:54323](http://localhost:54323).
The local email inbox is available at
[http://localhost:54324](http://localhost:54324).

### 5. Start the development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Access the dashboard

Open [http://localhost:3000/en-US/auth](http://localhost:3000/en-US/auth) or [http://localhost:3000/zh-CN/auth](http://localhost:3000/zh-CN/auth).

The auth page supports email/password sign-in and sign-up, and the dashboard `Config` page controls which OAuth providers are available.

The home page intro markdown and playlist URL are configured in the dashboard `Config` page, not through environment variables.

If you need admin access for an existing user, use the interactive maintenance menu:

```bash
bun run menu dev
```

Then choose `Promote user to admin`.

## Database

### Local

| Command                                    | Use                                             |
| ------------------------------------------ | ----------------------------------------------- |
| `bunx supabase start`                      | Start local Supabase services.                  |
| `bunx supabase status`                     | Get local URLs and keys for `.env.development`. |
| `bun run supabase:setup`                   | Start Supabase and update `.env.development`.   |
| `bun run supabase:env`                     | Update Supabase values in `.env.development`.   |
| `bunx supabase db reset --local`           | Rebuild the local schema and fixtures.          |
| `bunx supabase db reset --local --no-seed` | Rebuild an empty local database.                |
| `bun run supabase:types`                   | Regenerate local database types.                |
| `bunx supabase stop`                       | Stop Supabase while preserving local data.      |

The files under `supabase/schemas` describe the local database structure. After
changing them, rebuild the local database with `bunx supabase db reset --local`,
then regenerate types with `bun run supabase:types`. This repository does not
use Supabase migration history for schema deployment.
The local seed also creates the public `images` storage bucket; uploads and
deletions remain restricted to admins by the storage policy.

Next.js automatically loads `.env.development` during local development.
Environment files are loaded when Next.js starts;
restart the dev server after changing them.

## Markdown Support

Content is rendered with `react-markdown`, `remark-gfm`, and custom directive handling.

### PlantUML

Use a fenced code block with `plantuml` or `puml`:

````md
```plantuml
@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi
@enduml
```
````

The client compresses and encodes the source, then requests SVG output from the public PlantUML server:

```txt
https://www.plantuml.com/plantuml/svg/{encoded}
```

Because diagrams are sent to a public service, avoid putting sensitive content in PlantUML blocks.

### Custom directives

The renderer also supports custom directives such as:

- `:ref[...]` for linking to posts, thoughts, events, files, or external URLs
- `::card{title="..." tone="info"}` for callout-style content blocks
- `:meta{url="https://..."}` for URL metadata cards

## Post Translation Preview

Open `/{locale}/translation-preview/posts/{id}` with a public post UUID and
either `en-US` or `zh-CN`. This experimental page is marked `noindex` and is not
linked from navigation or included in a sitemap. Existing post pages, editing,
and webhooks are unchanged. Metadata always uses the original post.

The title and complete Markdown body translate independently. Each initially
shows the original with a translating indicator when no saved result exists,
then streams its result into the page. Each translated unit has its own
original/translation toggle; switching is local and keeps the current locale.
The body outline and copy button follow the displayed version.

Configure an OpenAI-compatible **Chat Completions** endpoint in your local
environment file (or deployment environment), then restart the server:

```dotenv
TRANSLATION_AI_API_KEY=
TRANSLATION_AI_BASE_URL=
TRANSLATION_AI_MODEL=
```

`TRANSLATION_AI_BASE_URL` is the API base, for example
`https://your-provider.example/v1`, without `/chat/completions`. These values
are read only when generating; builds and saved translations work without
them. Missing configuration, provider failures, invalid output, and database
outages show the original with “Translation temporarily unavailable”. A
confident local language match or an identical model response is saved as
`unchanged` and has no toggle. Traditional Chinese still requires conversion
for `zh-CN`; short or ambiguous text is sent through normal translation.

`supabase/schemas/05_translations.sql` defines a separate, service-role-only
`translation_cache` table and atomic claim/finish functions. Apply this schema
through your normal database deployment workflow before using the preview.
Results have no automatic TTL. The key hashes the full, unmodified context
plus the target locale and an internal rule version; changing a title does not
regenerate its body, and changing models does not discard saved translations.
The model timeout is 90 seconds with no SDK retries; the route allows 120
seconds. Claims have a 120-second lease and failures a 30-second cooldown.

Next.js caches batch reads for minutes. Missing results receive temporary
`translation:pending:{translationKey}` tags. After a request persists or
rediscovers a result, one request-scoped `after()` callback expires those tags.
Subsequent requests rebuild the static output with translations. Time-based
revalidation recovers from an interrupted response or failed refresh. A brief
refresh window is expected; already cached pages in other browsers are not
actively cleared. The admin “revalidate all” operation includes the shared
`translation:all` tag; it refreshes Next.js reads, without deleting database
translations. See [Architecture](./DOCS/ARCHITECTURE.md#post-translation-preview)
for the request and storage boundaries.

## Scripts

- `bun run dev` - start the Next.js dev server
- `bun run build` - build for production
- `bun run start` - start the production server
- `bun run lint` - run Oxlint checks
- `bun run lint:fix` - apply Oxlint fixes
- `bun run fmt` - check Oxfmt formatting
- `bun run fmt:fix` - apply Oxfmt formatting
- `bun run typecheck` - run TypeScript checks
- `bun run check` - run formatting, lint, and TypeScript checks
- `bun run test` - run Bun tests
- `bun run menu dev` - open the interactive maintenance menu with `.env.development`
- `bun run menu prod` - open the interactive maintenance menu with `.env.production`
- `bun run gen:icons` - regenerate icon components from `public/svg-icons`
- `bun run supabase:setup` - start local Supabase and generate `.env.development`
- `bun run supabase:env` - refresh local Supabase values in `.env.development`
- `bun run supabase:types` - generate Supabase types from the local database

Supabase operations are intentionally kept explicit. Use the local commands
above so the target database is clear.

The interactive menu currently includes:

- Rebind webhooks
- Promote user to admin

## Verification

GitHub Actions runs `fmt`, `lint`, `typecheck`, and `test` on branch pushes.
Pushes do not automatically create pull requests.

`bun install` installs the Husky Git hooks. Before each commit, the pre-commit
hook runs `bun run check` against the whole working tree, including unstaged
changes, and blocks the commit if formatting, lint, or TypeScript checks fail.
The hook does not modify or stage files. Use `bun run fmt:fix` and
`bun run lint:fix` to apply fixes, review them, and stage the intended changes
before retrying. Run `bun run prepare` to reinstall hooks if needed.

Use the relevant checks locally; Markdown-only edits need formatting checks.
Formatter and lint rules live in `.oxfmtrc.json` and `.oxlintrc.json`.

Source filenames follow `subject.role.ts(x)` with framework, generated, locale,
index, and tool exceptions. Keep page-level hooks in `_hooks` and editor-private
hooks beside their editor. See [AGENTS.md](./AGENTS.md#file-naming) for naming
rules and [Architecture](./DOCS/ARCHITECTURE.md#module-ownership) for ownership.

Thought image URLs are deduplicated at the service read/write boundary, keeping
their first occurrence and order. Uploads maintain the same invariant in editor
state, so image lists can use URLs as stable keys. Recent-plan row IDs exist
only in editor state and are omitted from saved configuration.

For routing, cache, or server/client integration changes, also check a production
build with `bun run build`. CI does not build the app. There is currently no
browser test suite; verify affected behavior in the running app: locales and
auth roles, cache invalidation, or light/dark and mobile/desktop layouts.

### Translation verification

The service tests use a local Chat Completions endpoint and cover temporary
tags, delayed concurrent requests, partial failures, stale misses, missing
configuration, prefetch guards, language detection, and Markdown validation:

```bash
bun run test src/lib/server/translations
# Optional real 90-second timeout check (adds about 95 seconds):
TRANSLATION_TEST_TIMEOUT=1 bun run test src/lib/server/translations
```

Run database tests only against an isolated local Supabase project with a
different project ID and unused ports. Copy `supabase/` to a temporary workdir,
adjust its `config.toml`, then start and initialize that project with
`bunx supabase --workdir <temporary-directory> ...`. Apply all schemas and
fixtures there and generate types from that instance; do not reset your normal
local database or use a remote instance for these tests.

```bash
TRANSLATION_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  bun run test scripts/translations
```

These tests reject remote hosts and the usual local database port `54322`.
They remove only the temporary translation rows they create. Without this
variable, database integration tests are skipped.

For browser and production checks, run `bun scripts/translations/mock-ai.ts`.
Point the app at the isolated database and set the three AI values to
`local-test`, `http://127.0.0.1:4318/v1`, and `local-test`, respectively. Configure
responses with `POST http://127.0.0.1:4318/__control`:

```json
{
  "Exact original title": { "text": "翻译后的标题", "delayMs": 3000 },
  "Exact original body": { "text": "翻译后的正文", "delayMs": 10000 }
}
```

Each response also accepts `status` (default `200`) and `finishReason` (default
`stop`). `GET /__calls` returns the requested contexts; posting new controls
clears the call history. Unconfigured contexts fail explicitly. Use delays to
observe independent Suspense completion, then reload after the response to
verify a static translated shell with no new model calls. Check original and
translated outlines/copy, hidden posts, build/prefetch call counts, and reuse
after a process restart. Real provider translation quality still needs review
after filling in the actual configuration.

## Project Structure

```txt
.
├── scripts/                 # Interactive maintenance utilities
├── src/
│   ├── app/                 # App Router pages and API routes
│   ├── components/          # Shared UI and feature components
│   ├── lib/                 # Client/server/shared helpers
│   ├── styles/              # Global styles
│   └── types/               # Shared TypeScript types
├── supabase/
│   ├── config.toml          # Local Supabase CLI configuration
│   ├── schemas/              # Local schema source files
│   └── seed.sql              # Local development fixtures
└── public/                  # Static assets
```

## Deployment Notes

For deployment, provide the same environment variables as local development, especially:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEBHOOK_SECRET`

If OAuth is enabled, make sure your Supabase auth redirect URLs include your deployed site URL and the callback route.

## Documentation

- [Development conventions](./AGENTS.md)
- [Architecture](./DOCS/ARCHITECTURE.md)
- [TODO](./DOCS/TODO.md)

## License

[MIT](LICENSE)
