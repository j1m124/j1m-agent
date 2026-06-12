import { createFileRoute } from "@tanstack/react-router";
import "../../server/loadEnv"; // ensure OPENROUTER_API_KEY etc. are loaded in dev
import { runAgent } from "../../harness/loop";
import { systemPrompt } from "../../harness/prompts";
import type { ChatMessage } from "../../harness/types";
import type { SSEEvent } from "../../harness/events";

// Milestone 3: the harness loop behind an SSE endpoint. The server is STATELESS —
// each request carries the full conversation; we prepend the system prompt and stream
// the agent's events back as `data: <json>\n\n` frames. Same emit() the terminal
// renderer uses, only the sink differs.
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { messages?: ChatMessage[]; password?: string };
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

        const conversation = Array.isArray(body.messages) ? body.messages : [];
        const messages: ChatMessage[] = [
          { role: "system", content: systemPrompt() },
          ...conversation,
        ];

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let closed = false;
            const emit = (ev: SSEEvent) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
              } catch {
                closed = true; // controller already closed (client gone)
              }
            };
            runAgent(messages, emit, request.signal)
              .catch((e: any) => emit({ type: "error", message: e?.message ?? String(e) }))
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
