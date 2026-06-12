# j1m-agent

A Perplexity-like **agentic answer engine**, built to learn how an agent harness
works. The loop is hand-rolled; everything else is rented. See [PLAN.md](./PLAN.md)
for the full design.

## Status

- ✅ **Terminal harness** — hand-rolled `model → tools → observation` loop (`src/harness/*`).
- ✅ **Tools** — web search/fetch + datetime via **OpenRouter server tools** (server-side).
- ✅ **SSE endpoint** — `POST /api/chat` streams the loop's events (TanStack Start route).
- ✅ **Web UI** — chat with live trace, streaming answers, citations (`src/client/*`).
- ✅ **Multi-session** — localStorage persistence, background-safe streaming, sidebar.
- ✅ **Gate + deploy** — shared-password gate + Render (native Bun) config.
- ⬜ `run_script` — a client-side user tool (deferred; seam in `src/harness/tools.ts`).

## Quick start

```sh
bun install
cp .env.example .env          # set OPENROUTER_API_KEY (web tools need no other keys)
bun run dev                   # http://localhost:3000
```

Other entry points:

```sh
bun run harness "your question"   # the loop in a terminal, no UI
bun run build && bun run start    # production build + Bun server (what Render runs)
bun run typecheck                 # tsc --noEmit
```

> **Cost note:** OpenRouter server tools bill credits even on a free model —
> web_search ≈ $0.005/search, web_fetch ≈ $1/1k fetches, datetime free. Set a hard
> prepaid credit cap on your OpenRouter account before exposing the app.

## How it's wired

```
Browser (localStorage)  ──POST /api/chat {messages,password}──▶  TanStack Start route
   src/client/*                                                    src/routes/api/chat.ts
   stream.ts: fetch + getReader()  ◀──── data: <SSEEvent>\n\n ────  runAgent(messages, emit)
                                                                     src/harness/loop.ts
```

The core is `src/harness/loop.ts` — it only ever calls `emit(event)`, never touching a
terminal or socket. The terminal renderer (`scripts/harness.ts`) and the SSE route each
supply their own `emit`; the loop is identical in both. The server is **stateless** —
every request carries the full conversation; all persistence is client-side localStorage.

**Tools** (`src/harness/tools.ts`): `SERVER_TOOLS` run inside OpenRouter (citations come
back as `url_citation` annotations → the sources list); `USER_TOOLS` run in *this* client
loop and would show live `step`/`tool_result` trace — `run_script` is the seam for that.

## Deploy (Render, native Bun)

`render.yaml` is a starting blueprint. Deployment is your step: push to GitHub, create a
Render Blueprint, set `OPENROUTER_API_KEY` + `APP_PASSWORD` in the dashboard, and cap your
OpenRouter credits first. Build: `bun install && bun run build`; start: `bun run start`
(reads `PORT`). Free tier spins down after ~15 min idle (~30–60s cold start).
