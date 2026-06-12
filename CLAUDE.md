# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Perplexity-like **agentic answer engine**, built to learn how an agent harness works.
The deliberate principle: **the agent loop is hand-rolled; everything else is rented.**
Avoid reaching for SDK chat/agent helpers (e.g. TanStack AI, Vercel AI SDK) — they hide
the loop, which is the point of the project.

## Commands

Runtime is **Bun** (not Node, though Node is installed and the Vite dev server runs under it).

```sh
bun install
bun run dev                       # TanStack Start dev server on :3000
bun run harness "your question"   # run the agent loop in the terminal, no UI
bun run build                     # vite build -> dist/client + dist/server
bun run start                     # production: bun prod-server.ts (serves dist/)
bun run typecheck                 # tsc --noEmit
```

There is **no test suite**; `bun run typecheck` is the only automated check. tsconfig is
strict with `noUncheckedIndexedAccess`. `prod-server.ts` is intentionally outside the
typecheck `include` (it imports the build output, which may not exist).

Requires a `.env` with `OPENROUTER_API_KEY` (copy `.env.example`). `OPENROUTER_MODEL`
selects the model; web search/fetch/datetime are OpenRouter server tools and need no
other keys.

## Architecture — the parts that span files

**The loop is the core.** `src/harness/loop.ts` (`runAgent`) is a framework-agnostic
`model -> tools -> observation -> model` loop with a step cap (`MAX_STEPS`). It **only ever
calls `emit(event)`** — it never touches a terminal, socket, or HTTP response. This is the
key seam: two callers supply different `emit` implementations over the *same* loop:
- `scripts/harness.ts` — a terminal renderer (ANSI).
- `src/routes/api/chat.ts` — enqueues each event as an SSE `data: <json>\n\n` frame.

Event shapes live in `src/harness/events.ts` (`SSEEvent`); the client parses the identical
wire format in `src/client/stream.ts`.

**Two kinds of tools** (`src/harness/tools.ts`) — this distinction is essential:
- `SERVER_TOOLS` (`openrouter:web_search` / `web_fetch` / `datetime`): executed by
  OpenRouter **server-side**. The model calls them and OpenRouter loops internally, so
  they NEVER surface to our loop as tool calls. Their citations come back as
  `url_citation` **annotations**, accumulated in `openrouter.ts` and harvested into the
  `sources` list in `loop.ts`. Consequence: the live trace shows no per-search steps for
  these (they're opaque mid-stream); sources appear only at the end.
- `USER_TOOLS` (currently just `run_script`): executed by *this* client inside the loop
  via `runTool`. When the model calls one, OpenRouter hands the tool_call back to us; we
  run it and append the result as a `role:"tool"` message, then loop. This is the seam
  where the hand-rolled loop still does real work (server tools never reach `runTool`).

**`run_script`** (`src/harness/runScript.ts`): a pure-computation JS sandbox for the model
— exact arithmetic, date math, parsing/reshaping data. The model writes a snippet, we run
it inside a **QuickJS interpreter compiled to WASM** (`quickjs-emscripten`), and feed back
whatever it `console.log`'d (or its final value if nothing was logged). The sandbox is a
*separate VM* with **no host bindings** — no `fetch`, no filesystem, no `process` — so the
safety model is severed-by-construction, not lock-it-down-by-hand; it can't retrieve
anything (that's what the server tools are for). Each call gets a fresh runtime+context
(stateless), bounded by a ~1s interrupt deadline and a 32MB memory cap; errors/timeouts
come back as `ERROR: …` data, not throws. Runs in-process under both Bun and Node (Vite
dev), so it needs no extra config or env vars. (It originally targeted a deployed
Cloudflare Worker, but the `unsafe_eval` binding that needed is local-dev-only — QuickJS
in-process is a stronger sandbox anyway.) Tool output is surfaced in the trace via the
`output` field on the `tool_result` event.

**OpenRouter client** (`src/harness/openrouter.ts`): hand-rolled streaming SSE parser that
reassembles `content`, `tool_calls` (by `index`), and annotations into one assistant
message. Retries transient failures (429 / 5xx / network) with backoff, but only if
nothing has been streamed yet. Error codes matter: 402 = no credits, 429 = rate limit,
5xx = transient server error.

**Server is stateless.** `src/routes/api/chat.ts` prepends the system prompt to the
client-sent conversation each request and streams back. No server-side session state — all
persistence is client-side `localStorage`. The password gate (`APP_PASSWORD`) is only
enforced when that env var is set.

**Client** (`src/client/`): a hand-rolled store (`store.ts`, `useSyncExternalStore` +
localStorage — no state library) holds multiple sessions keyed by id. Streaming is
**background-safe**: events route to their owning `sessionId`, so off-screen sessions keep
updating; one generation in flight per session via an `AbortController` map. Components are
in `src/client/components/`.

## Gotchas (do not regress these)

- **Date injection.** `prompts.ts` injects the current date (server clock) into the system
  prompt and tells the model not to treat its training cutoff as "now". Without this the
  model dismisses genuinely-current news as fake/"future-dated". Do NOT remove it in favor
  of the datetime tool alone — the model only calls that tool when explicitly asked the date.
- **Env loading.** Bun auto-loads `.env` for `bun run scripts/...` and `bun prod-server.ts`,
  but the Vite dev server runs under Node, which doesn't. `src/server/loadEnv.ts` (imported
  by the SSE route) bridges that; it's a no-op in production where the host injects env vars.
- **Theme.** Dark mode is a manual `.dark` class on `<html>` (Tailwind v4 `@custom-variant`
  in `styles.css`), applied pre-paint by an inline script in `__root.tsx`. All components
  carry both light and `dark:` variants.
- **Production output.** `dist/server/server.js` exports a `{ fetch }` handler and does NOT
  self-listen; `prod-server.ts` (Bun.serve) serves `dist/client` statically and delegates
  everything else to it.
- TanStack Start's server-route API has churned historically — confirm against current docs
  before changing `routes/api/*` shapes. `src/routeTree.gen.ts` is generated (gitignored).
