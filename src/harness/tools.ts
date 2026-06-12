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
//   does its thing. `run_script` lives here — a QuickJS-WASM sandbox (see runScript.ts).

import type { ToolCall } from "./types";
import { runScript, type RunScriptArgs } from "./runScript";

export const SERVER_TOOLS = [
  // max_results / max_uses bound per-request cost (these bill OpenRouter credits).
  { type: "openrouter:web_search", parameters: { max_results: 5 } },
  { type: "openrouter:web_fetch", parameters: { max_uses: 5 } },
  { type: "openrouter:datetime" },
];

// Standard OpenAI function-tool shape (distinct from the SERVER_TOOLS shape). OpenRouter
// accepts both kinds in the same `tools` array. run_script runs in-process, so it needs
// no external config — it's always offered.
export const USER_TOOLS: unknown[] = [
  {
    type: "function",
    function: {
      name: "run_script",
      description:
        "Run a short, self-contained JavaScript snippet in a sandbox and get back whatever it prints with console.log(). Use it whenever exactness matters: arithmetic on numbers you've gathered, date/time math, parsing or reshaping data, unit conversions, or sanity-checking logic — instead of computing in your head. The sandbox is pure computation: NO network, NO file system, no fetch, no access to this conversation, so it CANNOT look anything up (use web_search / web_fetch for that). Standard JS built-ins only (Math, JSON, Date, Array, string methods…); no imports, no async/await. You MUST console.log the result you want returned — the value of the last expression is used only if nothing was logged. Scripts are killed after ~1 second of CPU time, so keep them light.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "JavaScript source to execute. console.log whatever you want returned.",
          },
        },
        required: ["code"],
      },
    },
  },
];

// Dispatch a client-side (user-defined) tool call. Throws on unknown tool or bad
// input; loop.ts catches and feeds the error back to the model as the tool result
// (errors-as-data). Server tools never reach here.
export async function runTool(tc: ToolCall): Promise<string> {
  switch (tc.function.name) {
    case "run_script": {
      let args: RunScriptArgs;
      try {
        args = JSON.parse(tc.function.arguments || "{}") as RunScriptArgs;
      } catch {
        throw new Error("run_script received malformed JSON arguments");
      }
      return runScript(args);
    }
    default:
      throw new Error(`Unknown tool: ${tc.function.name}`);
  }
}
