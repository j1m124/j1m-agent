import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { stopSession, useStore } from "../store";
import type { TraceStep, UIMessage } from "../store";
import type { Source } from "../../harness/types";

export function MessageList() {
  const session = useStore((s) => (s.currentId ? s.sessions[s.currentId] : null));
  if (!session) return null;
  const lastIndex = session.messages.length - 1;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {session.messages.length === 0 && (
          <p className="pt-24 text-center text-neutral-400 dark:text-neutral-500">
            Ask a question to get started.
          </p>
        )}
        {session.messages.map((m, i) => (
          <Message
            key={i}
            message={m}
            sessionId={session.id}
            generating={session.status === "generating" && i === lastIndex}
          />
        ))}
      </div>
    </div>
  );
}

function Message({
  message,
  generating,
  sessionId,
}: {
  message: UIMessage;
  generating: boolean;
  sessionId: string;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-200 px-4 py-2 text-sm dark:bg-neutral-800">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message.trace && message.trace.length > 0 && <Trace steps={message.trace} />}
      {message.content && (
        <div className="prose prose-sm max-w-none prose-pre:bg-neutral-100 dark:prose-invert dark:prose-pre:bg-neutral-900">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      )}
      {generating && !message.content && <ThinkingDots />}
      {message.error && <p className="text-sm text-red-600 dark:text-red-400">⚠ {message.error}</p>}
      {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
      {generating && (
        <button
          onClick={() => stopSession(sessionId)}
          className="text-xs text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
        >
          ■ Stop
        </button>
      )}
    </div>
  );
}

// Live tool trace. Note: web_search/web_fetch run server-side (OpenRouter), so they
// don't surface here — this lights up for client-side tools (e.g. a future run_script).
function Trace({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/50">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <span
            className={
              s.ok === null || s.ok === undefined
                ? "animate-pulse text-amber-500"
                : s.ok
                  ? "text-emerald-500"
                  : "text-red-500"
            }
          >
            {s.ok === null || s.ok === undefined ? "▸" : s.ok ? "✓" : "✗"}
          </span>
          <span className="font-mono">{s.tool}</span>
          <span className="truncate text-neutral-400 dark:text-neutral-500">{describeArgs(s.args)}</span>
        </div>
      ))}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Sources
      </p>
      <ol className="space-y-1 text-sm">
        {sources.map((s) => (
          <li key={s.n} className="flex gap-2">
            <span className="shrink-0 text-neutral-400 dark:text-neutral-500">[{s.n}]</span>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sky-600 hover:underline dark:text-sky-400"
            >
              {s.title || s.url}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 text-neutral-400 dark:text-neutral-500">
      <span className="animate-bounce">●</span>
      <span className="animate-bounce [animation-delay:0.15s]">●</span>
      <span className="animate-bounce [animation-delay:0.3s]">●</span>
    </div>
  );
}

function describeArgs(args: unknown): string {
  if (args && typeof args === "object") {
    const a = args as Record<string, unknown>;
    if (typeof a.query === "string") return `"${a.query}"`;
    if (typeof a.url === "string") return a.url;
  }
  return "";
}
