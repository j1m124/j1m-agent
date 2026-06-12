import { useEffect, useState } from "react";
import { bootstrapAuth, useStore } from "../store";
import { Gate } from "./Gate";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export function ChatApp() {
  // Render nothing until mounted: the store reads localStorage, which only exists on
  // the client. This keeps server and first client render identical (both null), so
  // there's no hydration mismatch, then we populate from storage after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    void bootstrapAuth(); // decide entry: skip gate if no password, else verify stored one
  }, []);
  const authed = useStore((s) => s.authed);
  const authChecked = useStore((s) => s.authChecked);

  // Hold until the server tells us whether/which password is needed — avoids
  // flashing the gate at a returning user with a valid stored password.
  if (!mounted || !authChecked) return null;
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
