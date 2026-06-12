// Client-side SSE consumer. POSTs the conversation and reads the response body as a
// stream, parsing `data: <json>\n\n` frames into SSEEvents — the same wire format the
// server emits and (not coincidentally) the same shape OpenRouter streams inbound.

import type { SSEEvent } from "../harness/events";
import type { ChatMessage } from "../harness/types";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function streamChat(opts: {
  messages: ChatMessage[];
  password: string;
  signal?: AbortSignal;
  onEvent: (ev: SSEEvent) => void;
}): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: opts.messages, password: opts.password }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw new HttpError(res.status, `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; keep the trailing partial buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        opts.onEvent(JSON.parse(data) as SSEEvent);
      } catch {
        // ignore a malformed frame
      }
    }
  }
}
