// Streaming chat-completions client for OpenRouter (OpenAI-compatible protocol).
//
// OpenRouter streams Server-Sent Events: a sequence of `data: {json}` lines, an
// optional `: comment` keep-alive line, and a terminal `data: [DONE]`. Each JSON
// chunk carries `choices[0].delta`, which holds EITHER a piece of `content` OR a
// slice of one or more `tool_calls`. Tool-call deltas arrive fragment-by-fragment
// and must be reassembled by their `index`. When the stream ends we hand back a
// single assembled assistant message — content and/or fully-formed tool calls.
//
// Transient failures (429 rate-limit, 5xx server errors — common with free models —
// and network blips) are retried with backoff, but only if NOTHING was streamed yet
// (we can't cleanly re-stream once tokens have been emitted to the caller).

import type { Annotation, ChatMessage, ToolCall } from "./types";
import { DEFAULT_MODEL } from "./models";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_ATTEMPTS = 3;

class OpenRouterError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

export interface StreamOptions {
  messages: ChatMessage[];
  tools?: unknown[]; // omit (e.g. on the last step) to force a text answer
  model?: string; // overrides the built-in default
  onToken?: (text: string) => void; // fires for each content delta
  signal?: AbortSignal; // abort the request (e.g. client disconnected)
}

export async function streamCompletion(opts: StreamOptions): Promise<ChatMessage> {
  for (let attempt = 1; ; attempt++) {
    let emitted = false;
    const wrapped: StreamOptions = {
      ...opts,
      onToken: opts.onToken
        ? (t) => {
            emitted = true;
            opts.onToken!(t);
          }
        : undefined,
    };

    try {
      return await streamOnce(wrapped);
    } catch (e) {
      // Don't retry if we already streamed output, ran out of attempts, were
      // aborted, or the error isn't transient (e.g. 401/400).
      if (emitted || attempt >= MAX_ATTEMPTS || opts.signal?.aborted || !isTransient(e)) {
        throw e;
      }
      const status = e instanceof OpenRouterError ? e.status : undefined;
      console.warn(`OpenRouter ${status ?? "network"} error — retry ${attempt}/${MAX_ATTEMPTS - 1}`);
      await sleep(backoffMs(attempt));
      if (opts.signal?.aborted) throw e;
    }
  }
}

async function streamOnce(opts: StreamOptions): Promise<ChatMessage> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  // Caller's choice (the client selector) wins; otherwise the built-in default.
  const model = opts.model || DEFAULT_MODEL;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "j1m-agent",
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      tools: opts.tools,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new OpenRouterError(`OpenRouter ${res.status}: ${body.slice(0, 500)}`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let content = "";
  const toolCalls: ToolCall[] = [];
  const annotations: Annotation[] = []; // url_citation citations from server tools

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are newline-delimited; keep the trailing partial line buffered.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue; // keep-alive comment
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;

      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue; // ignore malformed frame
      }
      if (parsed.error) {
        const code = typeof parsed.error.code === "number" ? parsed.error.code : undefined;
        throw new OpenRouterError(`OpenRouter stream error: ${JSON.stringify(parsed.error)}`, code);
      }

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        opts.onToken?.(delta.content);
      }

      if (delta.tool_calls) {
        for (const d of delta.tool_calls) {
          const i: number = d.index ?? 0;
          if (!toolCalls[i]) {
            toolCalls[i] = { id: "", type: "function", function: { name: "", arguments: "" } };
          }
          const tc = toolCalls[i]!; // just ensured it exists
          if (d.id) tc.id = d.id;
          if (d.type) tc.type = d.type;
          if (d.function?.name) tc.function.name += d.function.name;
          if (d.function?.arguments) tc.function.arguments += d.function.arguments;
        }
      }

      // Server tools surface their citations as url_citation annotations. Depending
      // on the provider these arrive on the streamed delta or on the final message;
      // collect from both and dedupe by URL below.
      const incoming = delta.annotations ?? parsed.choices?.[0]?.message?.annotations;
      if (Array.isArray(incoming)) annotations.push(...incoming);
    }
  }

  const assembled: ChatMessage = { role: "assistant", content: content || null };
  const finalToolCalls = toolCalls.filter(Boolean); // drop any index gaps
  if (finalToolCalls.length) assembled.tool_calls = finalToolCalls;
  const dedupedAnnotations = dedupeAnnotations(annotations);
  if (dedupedAnnotations.length) assembled.annotations = dedupedAnnotations;
  return assembled;
}

// Retry transient failures only: rate limits, server errors, and network blips.
// Aborts and client errors (400/401/403/404) are not retried.
function isTransient(e: unknown): boolean {
  if (e instanceof Error && e.name === "AbortError") return false;
  if (e instanceof OpenRouterError && e.status != null) {
    return e.status === 429 || (e.status >= 500 && e.status < 600);
  }
  return e instanceof TypeError; // fetch network failure
}

function backoffMs(attempt: number): number {
  return 600 * 2 ** (attempt - 1) + Math.random() * 300; // ~0.6s, ~1.2s (+jitter)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Keep one annotation per URL, preferring an entry that carries a title.
function dedupeAnnotations(annotations: Annotation[]): Annotation[] {
  const byUrl = new Map<string, Annotation>();
  for (const a of annotations) {
    if (a?.type !== "url_citation" || !a.url_citation?.url) continue;
    const url = a.url_citation.url;
    const existing = byUrl.get(url);
    if (!existing || (!existing.url_citation.title && a.url_citation.title)) {
      byUrl.set(url, a);
    }
  }
  return [...byUrl.values()];
}
