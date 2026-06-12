// Events emitted by the agent loop. The loop never talks to a terminal or an HTTP
// stream directly — it only calls `emit(event)`. A terminal renderer (milestone 1)
// and the SSE route (milestone 3) each provide their own `emit`, so the loop is
// identical in both worlds. This is the seam that keeps the harness reusable.

import type { Source } from "./types";

export type SSEEvent =
  | { type: "step"; tool: string; args: unknown } // a tool call is starting
  | { type: "tool_result"; tool: string; ok: boolean; output?: string } // a tool call finished (output = stdout / error text, for client tools)
  | { type: "token"; text: string } // a chunk of the final answer
  | { type: "sources"; sources: Source[] } // ordered citation list
  | { type: "done" } // loop finished
  | { type: "error"; message: string }; // fatal error (e.g. model call failed)

export type Emit = (event: SSEEvent) => void;

// What the user sees when something fails. The original error (OpenRouter status/body,
// stack traces, etc.) is logged server-side instead of streamed to the browser, so we
// don't leak internals — see the sanitizing emit in routes/api/chat.ts.
export const GENERIC_ERROR_MESSAGE = "Something went wrong while generating a response. Please try again.";
