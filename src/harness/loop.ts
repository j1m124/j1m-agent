// THE HARNESS. This is the whole point of the project: a hand-rolled
// model → tools → observation → model loop. No framework, no SDK helper.
//
// Each iteration: stream one assistant turn. If it requested tools, run them all
// (in parallel), append the results, and loop. If it produced text with no tool
// calls, that text is the answer and we stop. A hard step cap bounds runaway
// loops; tools are withheld on the final step to force a text answer.

import type { ChatMessage, Source } from "./types";
import type { Emit } from "./events";
import { streamCompletion } from "./openrouter";
import { SERVER_TOOLS, USER_TOOLS, runTool } from "./tools";

export const MAX_STEPS = 6;

export async function runAgent(
  messages: ChatMessage[],
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  const sources: Source[] = []; // ordered citation list, built from url_citation annotations

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) return; // client disconnected — stop quietly
    const isLastStep = step === MAX_STEPS - 1;

    // Server tools always available; withhold USER tools on the last step so the
    // model can't request another client round-trip and must answer.
    const tools = isLastStep ? SERVER_TOOLS : [...SERVER_TOOLS, ...USER_TOOLS];

    let assistant: ChatMessage;
    try {
      assistant = await streamCompletion({
        messages,
        tools,
        onToken: (text) => emit({ type: "token", text }),
        signal,
      });
    } catch (e: any) {
      emit({ type: "error", message: e?.message ?? String(e) });
      emit({ type: "done" });
      return;
    }
    messages.push(assistant);

    // Harvest citations emitted by the server tools (web_search/web_fetch) into the
    // ordered sources list. Server-tool usage is otherwise invisible to us.
    for (const a of assistant.annotations ?? []) {
      if (a.type !== "url_citation" || !a.url_citation.url) continue;
      const url = a.url_citation.url;
      if (sources.some((s) => s.url === url)) continue;
      sources.push({ n: sources.length + 1, title: a.url_citation.title || url, url });
    }

    // No tool calls → this assistant turn is the final answer. (Server tool calls
    // are handled inside OpenRouter and never appear here; only user tools do.)
    if (!assistant.tool_calls?.length) {
      emit({ type: "sources", sources });
      emit({ type: "done" });
      return;
    }

    // Run every requested tool call in parallel. A failed tool returns its error
    // AS the tool result so the model can recover (try another source) instead of
    // crashing the whole request.
    const results = await Promise.all(
      assistant.tool_calls.map(async (tc): Promise<ChatMessage> => {
        let args: unknown;
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = tc.function.arguments;
        }
        emit({ type: "step", tool: tc.function.name, args });
        try {
          const out = await runTool(tc);
          emit({ type: "tool_result", tool: tc.function.name, ok: true });
          return { role: "tool", tool_call_id: tc.id, content: out };
        } catch (e: any) {
          emit({ type: "tool_result", tool: tc.function.name, ok: false });
          return { role: "tool", tool_call_id: tc.id, content: `ERROR: ${e?.message ?? String(e)}` };
        }
      })
    );
    messages.push(...results);
  }

  // Fell through the step cap without a clean answer (rare — last step withholds
  // tools, so the model almost always answers there).
  emit({ type: "sources", sources });
  emit({ type: "done" });
}
