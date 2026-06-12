import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Gate } from "./Gate";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export function ChatApp() {
  // Render nothing until mounted: the store reads localStorage, which only exists on
  // the client. This keeps server and first client render identical (both null), so
  // there's no hydration mismatch, then we populate from storage after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const authed = useStore((s) => s.authed);

  if (!mounted) return null;
  if (!authed) return <Gate />;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <MessageList />
        <Composer />
      </main>
    </div>
  );
}
