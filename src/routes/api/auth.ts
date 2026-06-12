import { createFileRoute } from "@tanstack/react-router";
import "../../server/loadEnv"; // ensure APP_PASSWORD is loaded in dev

// Auth gate verification. The /api/chat endpoint is the REAL security boundary —
// it refuses to spend OpenRouter credits without the correct password. This route
// just lets the client validate the password BEFORE entering the app, so a wrong
// password is rejected at the gate instead of silently letting the UI render and
// only failing on the first message.
//
// GET  -> { required } : does this deployment have an APP_PASSWORD at all? (lets
//          the client skip the gate entirely when none is set, e.g. local dev)
// POST { password } -> 200 if correct (or none required), 401 otherwise.
export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({ required: Boolean(process.env.APP_PASSWORD) });
      },
      POST: async ({ request }) => {
        let body: { password?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const expected = process.env.APP_PASSWORD;
        if (expected && body.password !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
