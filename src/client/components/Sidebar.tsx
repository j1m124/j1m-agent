import { createSession, deleteSession, selectSession, useStore } from "../store";
import { ThemeToggle } from "./ThemeToggle";

// Session list. A green dot marks any session currently generating (even off-screen).
// Collapsible: an off-canvas overlay on mobile (slides via transform), an in-flow panel
// that collapses to zero width on desktop (md+). The inner content stays a fixed w-64 so
// it doesn't reflow as the panel collapses — it's just clipped.
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const order = useStore((s) => s.order);
  const sessions = useStore((s) => s.sessions);
  const currentId = useStore((s) => s.currentId);

  // The sidebar is an overlay on mobile, so collapse it after navigating. On desktop it
  // stays put (selecting a chat shouldn't hide the list).
  function closeOnMobile() {
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches) {
      onClose();
    }
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-neutral-200 bg-neutral-50 transition-transform duration-200 ease-in-out dark:border-neutral-800 dark:bg-neutral-900 md:static md:transition-[width] ${
        open
          ? "translate-x-0 md:w-64"
          : "-translate-x-full md:w-0 md:translate-x-0 md:overflow-hidden md:border-r-0"
      }`}
    >
      <div className="flex h-full w-64 flex-col">
        <div className="p-3">
          <button
            onClick={() => {
              createSession();
              closeOnMobile();
            }}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            + New chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {order.map((id) => {
            const s = sessions[id];
            if (!s) return null;
            const active = id === currentId;
            return (
              <div
                key={id}
                onClick={() => {
                  selectSession(id);
                  closeOnMobile();
                }}
                className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm ${
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                    : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/50"
                }`}
              >
                {s.status === "generating" && (
                  <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                )}
                <span className="flex-1 truncate">{s.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(id);
                  }}
                  className="hidden text-neutral-400 hover:text-neutral-700 group-hover:block dark:text-neutral-500 dark:hover:text-neutral-200"
                  aria-label="Delete chat"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </nav>
        <div className="flex items-center justify-between border-t border-neutral-200 p-2 dark:border-neutral-800">
          <ThemeToggle />
          <span className="px-1 text-[10px] text-neutral-400 dark:text-neutral-600">
            stored locally
          </span>
        </div>
      </div>
    </aside>
  );
}
