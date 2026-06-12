import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { stopSession, useStore } from "../store";
import type { TraceStep, UIMessage } from "../store";
import type { Source } from "../../harness/types";
import { QuickPrompts } from "./QuickPrompts";

// A turn = a user question + its assistant reply. Messages are stored flat and always
// appended as a [user, assistant] pair; we regroup them so the latest turn can reserve
// a screen of space below the question (see the hoist behavior below).
interface Turn {
  key: number;
  user?: UIMessage;
  assistant?: UIMessage;
}

function toTurns(messages: UIMessage[]): Turn[] {
  const turns: Turn[] = [];
  messages.forEach((m, i) => {
    if (m.role === "user") {
      turns.push({ key: i, user: m });
    } else {
      const cur = turns[turns.length - 1];
      if (cur && !cur.assistant) cur.assistant = m;
      else turns.push({ key: i, assistant: m });
    }
  });
  return turns;
}

export function MessageList() {
  const session = useStore((s) => (s.currentId ? s.sessions[s.currentId] : null));
  const incognito = useStore((s) => s.incognitoId !== null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastQuestionRef = useRef<HTMLDivElement>(null);
  // Reserve a full viewport below the newest question so it can sit at the top with the
  // answer streaming in below. The scroll area's height is dynamic (the composer grows),
  // so measure it rather than guessing with CSS.
  const [reserve, setReserve] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setReserve(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Hoist on a new question: when the message count grows within the SAME session (a
  // send — not a session switch, not a streamed token), scroll the question to the top.
  const count = session?.messages.length ?? 0;
  const sessionId = session?.id ?? null;
  const prevCount = useRef(0);
  const prevSession = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (prevSession.current === sessionId && count > prevCount.current) {
      lastQuestionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    prevSession.current = sessionId;
    prevCount.current = count;
  }, [count, sessionId]);

  if (!session) return null;
  const turns = toTurns(session.messages);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {incognito && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
            Incognito chat — this conversation isn't saved to your history and disappears when you leave it.
          </p>
        )}
        {turns.length === 0 && <QuickPrompts />}
        {turns.map((turn, ti) => {
          const isLast = ti === turns.length - 1;
          return (
            <div
              key={turn.key}
              className="space-y-6"
              style={isLast && reserve ? { minHeight: reserve } : undefined}
            >
              {turn.user && (
                <div ref={isLast ? lastQuestionRef : undefined} className="scroll-mt-6">
                  <Message message={turn.user} sessionId={session.id} generating={false} />
                </div>
              )}
              {turn.assistant && (
                <Message
                  message={turn.assistant}
                  sessionId={session.id}
                  generating={isLast && session.status === "generating"}
                />
              )}
            </div>
          );
        })}
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
        <div className="prose prose-sm max-w-none prose-a:text-blue-600 prose-pre:bg-neutral-100 prose-pre:text-neutral-800 prose-pre:text-sm prose-code:text-sm dark:prose-invert dark:prose-a:text-blue-400 dark:prose-pre:bg-neutral-900 dark:prose-pre:text-neutral-100">
          <ReactMarkdown
            // singleDollarTextMath: false — a single `$` no longer starts math, so
            // currency ("$75 million", "$4.2 billion") stays literal text. Math must use
            // `$$…$$`. Without this, dollar amounts pair up and the prose between them
            // renders as one long non-wrapping equation that overflows the viewport.
            remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
            rehypePlugins={[rehypeKatex]}
          >
            {message.content}
          </ReactMarkdown>
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
// don't surface here — this lights up for client-side tools like run_script.
function Trace({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/50">
      {steps.map((s, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
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
          {s.output && (
            <pre className="mt-1 ml-6 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-2 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
              {s.output}
            </pre>
          )}
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
              className="truncate text-blue-600 hover:underline dark:text-blue-400"
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
    if (typeof a.code === "string") return a.code.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  return "";
}
