import { createFileRoute } from "@tanstack/react-router";
import "../../server/loadEnv"; // ensure OPENROUTER_API_KEY etc. are loaded in dev
import { runAgent } from "../../harness/loop";
import { systemPrompt } from "../../harness/prompts";
import { isAllowedModel } from "../../harness/models";
import type { ChatMessage } from "../../harness/types";
import { GENERIC_ERROR_MESSAGE, type SSEEvent } from "../../harness/events";

// Milestone 3: the harness loop behind an SSE endpoint. The server is STATELESS —
// each request carries the full conversation; we prepend the system prompt and stream
// the agent's events back as `data: <json>\n\n` frames. Same emit() the terminal
// renderer uses, only the sink differs.
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { messages?: ChatMessage[]; password?: string; model?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        // Shared-password gate (only enforced when APP_PASSWORD is set).
        const expected = process.env.APP_PASSWORD;
        if (expected && body.password !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Only honor a model that's on our curated allowlist; anything else falls back
        // to the env/default inside the loop. Stops a crafted request from billing an
        // arbitrary (expensive) model.
        const model = isAllowedModel(body.model) ? body.model : undefined;

        const conversation = Array.isArray(body.messages) ? body.messages : [];
        const messages: ChatMessage[] = [
          { role: "system", content: systemPrompt() },
          ...conversation,
        ];

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let closed = false;
            const send = (ev: SSEEvent) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
              } catch {
                closed = true; // controller already closed (client gone)
              }
            };
            // Sanitizing emit: keep the real error (OpenRouter status/body, etc.) on the
            // server console; the browser only ever gets a generic message.
            const emit = (ev: SSEEvent) => {
              if (ev.type === "error") {
                console.error("[api/chat] error:", ev.message);
                send({ type: "error", message: GENERIC_ERROR_MESSAGE });
                return;
              }
              send(ev);
            };
            runAgent(messages, emit, request.signal, model)
              .catch((e: any) => {
                console.error("[api/chat] uncaught:", e);
                send({ type: "error", message: GENERIC_ERROR_MESSAGE });
              })
              .finally(() => {
                if (closed) return;
                closed = true;
                try {
                  controller.close();
                } catch {
                  // already closed
                }
              });
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no", // defeat proxy buffering
          },
        });
      },
    },
  },
});
