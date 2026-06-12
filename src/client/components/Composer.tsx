import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { sendMessage, setModel, useStore } from "../store";
import { MODELS } from "../../harness/models";

// Grow the textarea with its content, then scroll past this many rows.
const MAX_ROWS = 5;

// Disabled while the CURRENT session is generating (background sessions keep going).
export function Composer() {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const status = useStore((s) => (s.currentId ? s.sessions[s.currentId]?.status : "idle"));
  const generating = status === "generating";

  // Auto-grow: reset to one line, then size to the content's scrollHeight capped at
  // MAX_ROWS. Re-runs on every text change — including the reset to "" on submit,
  // which collapses it back to a single row. leading-6 keeps lineHeight a stable px
  // value (an unset "normal" would parse to NaN).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    const max =
      parseFloat(cs.lineHeight) * MAX_ROWS +
      parseFloat(cs.paddingTop) +
      parseFloat(cs.paddingBottom);
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [text]);

  function submit() {
    const t = text.trim();
    if (!t || generating) return;
    setText("");
    void sendMessage(t);
  }

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-300 bg-white px-3 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-blue-400 dark:focus-within:ring-blue-400/20">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={generating ? "Generating…" : "Ask anything — I'll search the web."}
          disabled={generating}
          className="block w-full resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-neutral-400 disabled:opacity-50 dark:placeholder:text-neutral-500"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-0.5">
            <ModelSelector />
            <WebSearchToggle />
            <ReasoningSelector />
            <AttachButton />
          </div>
          <button
            onClick={submit}
            disabled={generating || !text.trim()}
            aria-label="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Global model picker. Hand-rolled (not a native <select>) so the trigger can hug the
// model name and the menu can be styled — rounded, hover states, a blue accent on the
// active model, the price as a subtle badge. Opens upward since the composer sits at the bottom.
function ModelSelector() {
  const model = useStore((s) => s.model);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.id === model);
  useDismiss(open, () => setOpen(false), rootRef);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        <span className="truncate">{current?.label ?? "Model"}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform dark:text-neutral-500 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-20 mb-2 min-w-[14rem] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {MODELS.map((m) => {
            const selected = m.id === model;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setModel(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  selected
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <span className="font-medium">{m.label}</span>
                <span className="text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
                  {m.note}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Close a popover on outside click or Escape. Shared by the model and reasoning menus.
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // ref/close are stable across renders here; mirrors the prior inline effect.
  }, [open]);
}

// The three controls below are presentational placeholders (UI only): they hold local
// state so they look and feel live, but nothing here is wired into the request, the store,
// or the agent loop yet. The active/selected state uses the same blue accent as the rest
// of the chrome. On small screens the text labels collapse to icons to avoid crowding the
// composer; the icon-only buttons stay tappable.

// Toggle: "search the web". Just a visual on/off for now.
function WebSearchToggle() {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      title="Enable web search"
      className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
        on
          ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      <GlobeIcon />
      <span className="hidden sm:inline">Search</span>
    </button>
  );
}

const EFFORTS = ["Off", "Low", "Medium", "High"] as const;

// Dropdown: "reasoning effort". Opens upward (composer sits at the bottom) like the model
// picker. Non-"Off" shows the accent.
function ReasoningSelector() {
  const [effort, setEffort] = useState<(typeof EFFORTS)[number]>("Off");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), rootRef);
  const active = effort !== "Off";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Reasoning effort"
        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
          active
            ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        <BulbIcon />
        <span className="hidden sm:inline">{active ? effort : "Reasoning"}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-20 mb-2 min-w-[8rem] overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {EFFORTS.map((e) => {
            const selected = e === effort;
            return (
              <button
                key={e}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setEffort(e);
                  setOpen(false);
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  selected
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                {e}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Button: "attach files". Placeholder — opens nothing yet.
function AttachButton() {
  return (
    <button
      type="button"
      title="Attach files"
      aria-label="Attach files"
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      <PaperclipIcon />
      <span className="hidden sm:inline">Attach</span>
    </button>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
