// Production server for Render (native Bun). `vite build` emits a web `fetch` handler
// at dist/server/server.js (it does NOT self-listen) plus static client assets in
// dist/client. This wraps both: static files are served first, everything else (SSR
// pages + the /api/chat SSE route) goes to the handler. Streaming and request-abort
// both work because Bun.serve passes a real Request with a `.signal`.
//
// Run with: bun prod-server.ts  (after `bun run build`). Render sets PORT.
import ssr from "./dist/server/server.js";

const clientDir = new URL("./dist/client/", import.meta.url);
const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  idleTimeout: 0, // don't cut off long agent runs (the model may search before replying)
  async fetch(req) {
    const url = new URL(req.url);
    // Serve a static client asset if one exists — but never for "/", which is SSR'd.
    if (url.pathname !== "/" && !url.pathname.includes("..")) {
      const file = Bun.file(new URL(`.${url.pathname}`, clientDir));
      if (await file.exists()) return new Response(file);
    }
    return (ssr as { fetch: (req: Request) => Promise<Response> }).fetch(req);
  },
});

console.log(`j1m-agent listening on http://localhost:${server.port}`);
