import { useEffect, useState } from "react";
import { bootstrapAuth, toggleIncognito, useStore } from "../store";
import { Gate } from "./Gate";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export function ChatApp() {
  // Render nothing until mounted: the store reads localStorage, which only exists on
  // the client. This keeps server and first client render identical (both null), so
  // there's no hydration mismatch, then we populate from storage after mount.
  const [mounted, setMounted] = useState(false);
  // Sidebar visibility. Open by default on desktop, closed on mobile (it's an overlay
  // there). Decided once on mount — client-only, so no SSR/hydration concern.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    setMounted(true);
    void bootstrapAuth(); // decide entry: skip gate if no password, else verify stored one
    setSidebarOpen(window.matchMedia("(min-width: 768px)").matches);
  }, []);
  const authed = useStore((s) => s.authed);
  const authChecked = useStore((s) => s.authChecked);
  const incognito = useStore((s) => s.incognitoId !== null);

  // Hold until the server tells us whether/which password is needed — avoids
  // flashing the gate at a returning user with a valid stored password.
  if (!mounted || !authChecked) return null;
  if (!authed) return <Gate />;

  return (
    <div className="flex h-screen">
      {/* Mobile-only backdrop; tapping it closes the drawer. */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-neutral-200 p-2 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
            className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            j1m-agent
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleIncognito()}
              aria-label="Incognito chat"
              aria-pressed={incognito}
              title={incognito ? "Exit incognito chat" : "New incognito chat (not saved)"}
              className={`rounded-md p-2 transition-colors ${
                incognito
                  ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              }`}
            >
              <IncognitoIcon />
            </button>
          </div>
        </header>
        <MessageList />
        <Composer />
      </main>
    </div>
  );
}

// Incognito glyph: a brimmed hat over a pair of glasses — the familiar "private/disguise"
// mark. Stroked to match the hamburger and other line icons in the UI.
function IncognitoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M6 9V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1" />
      <path d="M3 12h18" />
      <circle cx="7" cy="15.5" r="2.5" />
      <circle cx="17" cy="15.5" r="2.5" />
      <path d="M9.5 15.5c1-1 4-1 5 0" />
    </svg>
  );
}
