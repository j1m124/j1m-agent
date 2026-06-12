// Tool registry. Two kinds now:
//
// SERVER_TOOLS — executed by OpenRouter server-side. The model calls them and
//   OpenRouter runs the search/fetch and loops internally, so these NEVER surface
//   to our client loop as actionable tool_calls. Their citations come back as
//   url_citation annotations on the assistant message (harvested in loop.ts).
//
// USER_TOOLS — executed by THIS client inside the hand-rolled loop. When the model
//   calls one, OpenRouter hands the tool_call back to us; runTool dispatches it and
//   the result is appended to the conversation. This is where the harness loop still
//   does its thing. Empty for now — `run_script` is intended to live here.

import type { ToolCall } from "./types";

export const SERVER_TOOLS = [
  // max_results / max_uses bound per-request cost (these bill OpenRouter credits).
  { type: "openrouter:web_search", parameters: { max_results: 5 } },
  { type: "openrouter:web_fetch", parameters: { max_uses: 5 } },
  { type: "openrouter:datetime" },
];

export const USER_TOOLS: unknown[] = [
  // e.g. the run_script function schema goes here.
];

// Dispatch a client-side (user-defined) tool call. Throws on unknown tool or bad
// input; loop.ts catches and feeds the error back to the model as the tool result
// (errors-as-data). Server tools never reach here.
export async function runTool(tc: ToolCall): Promise<string> {
  switch (tc.function.name) {
    // case "run_script":
    //   return runScript(JSON.parse(tc.function.arguments || "{}"));
    default:
      throw new Error(`Unknown tool: ${tc.function.name}`);
  }
}
