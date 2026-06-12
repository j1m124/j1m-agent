// A tiny hand-rolled store (useSyncExternalStore + localStorage) — no state library,
// matching the project's "rent the chrome, hand-roll the core" ethos.
//
// Design invariants from the plan:
// - The SERVER is stateless; this store is the only persistence (localStorage).
// - Background-safe: off-screen sessions keep streaming; events route to their OWNING
//   sessionId, never the visible one. One generation in flight per session.
// - Persist on settle (debounced), never per token.

import { useSyncExternalStore } from "react";
import type { Source } from "../harness/types";
import type { ChatMessage } from "../harness/types";
import type { SSEEvent } from "../harness/events";
import { HttpError, streamChat } from "./stream";

export interface TraceStep {
  tool: string;
  args?: unknown;
  ok?: boolean | null; // null = running, true/false = finished
  output?: string; // tool stdout / error text (client tools only, e.g. run_script)
}

export interface UIMessage {
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
  sources?: Source[];
  error?: string;
}

export interface Session {
  id: string;
  title: string;
  messages: UIMessage[];
  status: "idle" | "generating";
  updatedAt: number;
}

export interface State {
  sessions: Record<string, Session>;
  order: string[]; // session ids, most-recent-first
  currentId: string | null;
  password: string | null;
  authed: boolean;
  authChecked: boolean; // has bootstrapAuth resolved entry yet? (gate decision)
}

const INDEX_KEY = "j1m:index";
const AUTH_KEY = "j1m:auth";
const chatKey = (id: string) => `j1m:chat:${id}`;

let state: State = {
  sessions: {},
  order: [],
  currentId: null,
  password: null,
  authed: false,
  authChecked: false,
};

const listeners = new Set<() => void>();
const inFlight = new Map<string, AbortController>(); // not part of the snapshot

function emitChange() {
  for (const l of listeners) l();
}

function setState(next: State, persistNow = false) {
  state = next;
  emitChange();
  if (persistNow) persist();
  else schedulePersist();
}

// ---- persistence -----------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 400);
}

function persist() {
  if (typeof window === "undefined") return;
  const index = state.order
    .map((id) => {
      const s = state.sessions[id];
      return s ? { id, title: s.title, updatedAt: s.updatedAt } : null;
    })
    .filter(Boolean);
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    for (const id of state.order) {
      const s = state.sessions[id];
      if (s) localStorage.setItem(chatKey(id), JSON.stringify({ ...s, status: "idle" }));
    }
  } catch {
    // storage full / unavailable — ignore
  }
}

let initialized = false;
function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const password = localStorage.getItem(AUTH_KEY);
  const sessions: Record<string, Session> = {};
  let order: string[] = [];
  try {
    const index = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]") as Array<{
      id: string;
      title: string;
      updatedAt: number;
    }>;
    for (const entry of index) {
      const raw = localStorage.getItem(chatKey(entry.id));
      if (!raw) continue;
      const s = JSON.parse(raw) as Session;
      sessions[entry.id] = { ...s, status: "idle" };
    }
    order = index.map((e) => e.id).filter((id) => sessions[id]);
  } catch {
    // corrupt storage — start clean
  }

  state = {
    sessions,
    order,
    currentId: order[0] ?? null,
    password,
    // A stored password no longer grants entry on its own — bootstrapAuth() must
    // re-verify it against the server first, so a stale/forged value can't get in.
    authed: false,
    authChecked: false,
  };

  if (!state.currentId) createSession();
  else emitChange();
}

// ---- actions ---------------------------------------------------------------

// Ask the server whether a password is correct (or not required at all). The same
// secret check guards /api/chat — this is just so we can decide entry up front.
async function verifyPassword(password: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  } catch {
    return false; // network error — treat as not authed, show the gate
  }
}

// Decide entry on load: skip the gate when no password is required, otherwise only
// enter if a previously-stored password still verifies. Called once on mount.
export async function bootstrapAuth(): Promise<void> {
  ensureInit();

  let required = true;
  try {
    const res = await fetch("/api/auth");
    if (res.ok) required = Boolean(((await res.json()) as { required?: boolean }).required);
  } catch {
    // network error — be conservative and show the gate
  }

  if (!required) {
    setState({ ...state, authed: true, authChecked: true });
    return;
  }

  const stored = state.password;
  const ok = stored != null && (await verifyPassword(stored));
  if (!ok && typeof window !== "undefined") localStorage.removeItem(AUTH_KEY);
  setState({ ...state, password: ok ? stored : null, authed: ok, authChecked: true });
}

// Gate submit: enter ONLY if the server confirms the password.
export async function submitPassword(password: string): Promise<boolean> {
  const ok = await verifyPassword(password);
  if (!ok) return false;
  if (typeof window !== "undefined") localStorage.setItem(AUTH_KEY, password);
  setState({ ...state, password, authed: true, authChecked: true }, true);
  return true;
}

export function clearAuth() {
  if (typeof window !== "undefined") localStorage.removeItem(AUTH_KEY);
  setState({ ...state, password: null, authed: false, authChecked: true }, true);
}

export function createSession(): string {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    title: "New chat",
    messages: [],
    status: "idle",
    updatedAt: Date.now(),
  };
  setState({
    ...state,
    sessions: { ...state.sessions, [id]: session },
    order: [id, ...state.order],
    currentId: id,
  });
  return id;
}

export function selectSession(id: string) {
  if (!state.sessions[id]) return;
  setState({ ...state, currentId: id });
}

export function deleteSession(id: string) {
  inFlight.get(id)?.abort();
  inFlight.delete(id);
  if (typeof window !== "undefined") localStorage.removeItem(chatKey(id));
  const { [id]: _removed, ...rest } = state.sessions;
  const order = state.order.filter((x) => x !== id);
  const currentId = state.currentId === id ? (order[0] ?? null) : state.currentId;
  setState({ ...state, sessions: rest, order, currentId }, true);
  if (!currentId) createSession();
}

function patchSession(id: string, patch: (s: Session) => Session) {
  const s = state.sessions[id];
  if (!s) return;
  const updated = patch(s);
  // bump to top of order on activity
  const order = [id, ...state.order.filter((x) => x !== id)];
  setState({ ...state, sessions: { ...state.sessions, [id]: updated }, order });
}

// Apply a streamed event to the OWNING session's last (assistant) message.
function applyEvent(id: string, ev: SSEEvent) {
  patchSession(id, (s) => {
    const messages = s.messages.slice();
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return s;
    const msg: UIMessage = { ...last };
    switch (ev.type) {
      case "token":
        msg.content += ev.text;
        break;
      case "step":
        msg.trace = [...(msg.trace ?? []), { tool: ev.tool, args: ev.args, ok: null }];
        break;
      case "tool_result": {
        const trace = (msg.trace ?? []).slice();
        // mark the most recent running step for this tool as finished
        for (let i = trace.length - 1; i >= 0; i--) {
          const step = trace[i];
          if (step && step.tool === ev.tool && (step.ok === null || step.ok === undefined)) {
            trace[i] = { ...step, ok: ev.ok, output: ev.output };
            break;
          }
        }
        msg.trace = trace;
        break;
      }
      case "sources":
        msg.sources = ev.sources;
        break;
      case "error":
        msg.error = ev.message;
        break;
      case "done":
        break;
    }
    messages[messages.length - 1] = msg;
    return { ...s, messages, updatedAt: Date.now() };
  });
}

export async function sendMessage(text: string) {
  const id = state.currentId;
  if (!id) return;
  const session = state.sessions[id];
  if (!session || session.status === "generating") return;

  const isFirst = session.messages.length === 0;
  const userMsg: UIMessage = { role: "user", content: text };
  const assistantMsg: UIMessage = { role: "assistant", content: "", trace: [], sources: [] };

  patchSession(id, (s) => ({
    ...s,
    title: isFirst ? text.slice(0, 60) : s.title,
    messages: [...s.messages, userMsg, assistantMsg],
    status: "generating",
    updatedAt: Date.now(),
  }));

  // Build the API message array: prior final turns + the new user turn. Drop the
  // trailing empty assistant placeholder and any trace/sources (server is stateless).
  const current = state.sessions[id];
  const apiMessages: ChatMessage[] = (current?.messages ?? [])
    .slice(0, -1)
    .map((m) => ({ role: m.role, content: m.content }));

  const controller = new AbortController();
  inFlight.set(id, controller);

  try {
    await streamChat({
      messages: apiMessages,
      password: state.password ?? "",
      signal: controller.signal,
      onEvent: (ev) => applyEvent(id, ev),
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      applyEvent(id, { type: "error", message: "Unauthorized — check the password." });
      clearAuth();
    } else if (!controller.signal.aborted) {
      applyEvent(id, { type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    inFlight.delete(id);
    patchSession(id, (s) => ({ ...s, status: "idle" }));
  }
}

export function stopSession(id: string) {
  inFlight.get(id)?.abort();
}

// ---- react binding ---------------------------------------------------------

function subscribe(cb: () => void): () => void {
  ensureInit();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}
