import { useState } from "react";
import { sendMessage, useStore } from "../store";

// Disabled while the CURRENT session is generating (background sessions keep going).
export function Composer() {
  const [text, setText] = useState("");
  const status = useStore((s) => (s.currentId ? s.sessions[s.currentId]?.status : "idle"));
  const generating = status === "generating";

  function submit() {
    const t = text.trim();
    if (!t || generating) return;
    setText("");
    void sendMessage(t);
  }

  return (
    <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
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
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
        />
        <button
          onClick={submit}
          disabled={generating || !text.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-50 hover:bg-neutral-800 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          Send
        </button>
      </div>
    </div>
  );
}
