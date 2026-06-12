// Milestone 1: run the agent loop in a terminal. No UI, no server.
//
//   bun run scripts/harness.ts                 # uses the default question
//   bun run scripts/harness.ts "your question"  # ask your own
//
// This file is just an `emit` implementation (a terminal renderer) wired to the
// same runAgent loop the server route will use later. The loop doesn't know or
// care that it's printing to a TTY.

import { runAgent } from "../src/harness/loop";
import { systemPrompt } from "../src/harness/prompts";
import type { ChatMessage } from "../src/harness/types";
import type { SSEEvent } from "../src/harness/events";

const DEFAULT_QUESTION = "What is TanStack Start, and how does it differ from Next.js?";

// ANSI helpers (kept tiny; no dependency).
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function makeRenderer() {
  let answerStarted = false;
  return (ev: SSEEvent) => {
    switch (ev.type) {
      case "step": {
        const a = ev.args as any;
        const detail = a?.query ? `"${a.query}"` : a?.url ?? JSON.stringify(a);
        process.stdout.write(`\n${cyan("▸ " + ev.tool)} ${dim(detail)}\n`);
        break;
      }
      case "tool_result":
        process.stdout.write(`  ${ev.ok ? green("✓") : red("✗")} ${dim(ev.ok ? "ok" : "failed")}\n`);
        break;
      case "token":
        if (!answerStarted) {
          process.stdout.write(`\n${bold("── answer ──")}\n`);
          answerStarted = true;
        }
        process.stdout.write(ev.text);
        break;
      case "sources":
        if (ev.sources.length) {
          process.stdout.write(`\n\n${bold("── sources ──")}\n`);
          for (const s of ev.sources) {
            process.stdout.write(`[${s.n}] ${s.title}\n    ${dim(s.url)}\n`);
          }
        }
        break;
      case "error":
        process.stdout.write(`\n${red("✗ error:")} ${ev.message}\n`);
        break;
      case "done":
        process.stdout.write("\n");
        break;
    }
  };
}

const question = process.argv.slice(2).join(" ").trim() || DEFAULT_QUESTION;
const model = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.6";

console.log(dim(`model: ${model}`));
console.log(bold(`? ${question}`));

const messages: ChatMessage[] = [
  { role: "system", content: systemPrompt() },
  { role: "user", content: question },
];

await runAgent(messages, makeRenderer());
