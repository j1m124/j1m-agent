// The `run_script` USER_TOOL: an in-process JavaScript sandbox.
//
// The model writes a short, self-contained, pure-computation script; we run it inside
// a QuickJS interpreter compiled to WASM (quickjs-emscripten) and hand back whatever it
// printed with console.log(). The sandbox has NO host bindings — no fetch, no file
// system, no process, no timers that reach us — because the interpreter is a *separate
// VM*, not our isolate. That severed-by-construction property IS the safety model: the
// script literally cannot reach out, so there's nothing to lock down by hand.
//
// This is the in-process realisation of the run_script plan. The plan's first design ran
// the script in a deployed Cloudflare Worker via the `unsafe_eval` binding; that binding
// turned out to be local-dev-only (it never runs in a published Worker), so we run the
// same idea here instead — a stronger sandbox, free, at the cost of the "serverless" goal.

import {
  getQuickJS,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSWASMModule,
} from "quickjs-emscripten";

const TIME_LIMIT_MS = 1000; // wall-clock budget per script (QuickJS interrupt deadline)
const MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
const MAX_STACK_BYTES = 1024 * 1024;
const MAX_OUTPUT_CHARS = 8000; // cap the observation we feed back to the model

// The WASM module loads once and is reused; every call still gets a *fresh* runtime +
// context, so scripts never see each other's state (stateless per call, per the plan).
let modulePromise: Promise<QuickJSWASMModule> | null = null;
function quickjs(): Promise<QuickJSWASMModule> {
  if (!modulePromise) modulePromise = getQuickJS();
  return modulePromise;
}

export interface RunScriptArgs {
  code?: unknown;
}

// Run one script; return the string observation that becomes the tool result. Failures
// are returned AS DATA (`ERROR: ...`), never thrown — matching the loop's errors-as-data
// contract, so the model reads the failure and can fix its script and retry.
export async function runScript(args: RunScriptArgs): Promise<string> {
  const code = typeof args?.code === "string" ? args.code : "";
  if (!code.trim()) return "ERROR: run_script called with empty `code`.";

  const QuickJS = await quickjs();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(MAX_STACK_BYTES);
  // The only defence against an infinite loop: QuickJS asks this handler periodically
  // whether to bail, and we say yes once the deadline passes. Synchronous, in-VM — it
  // does not depend on the host event loop (which the eval blocks while it runs).
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + TIME_LIMIT_MS));
  const ctx = runtime.newContext();

  const out: string[] = [];
  try {
    installConsole(ctx, out);

    const result = ctx.evalCode(code);
    if (result.error) {
      const message = stringifyHandle(ctx, result.error);
      result.error.dispose();
      // Surface anything logged before the throw, then the error.
      const prefix = out.length ? out.join("\n") + "\n" : "";
      return truncate(`${prefix}ERROR: ${message}`);
    }

    const value = ctx.dump(result.value) as unknown;
    result.value.dispose();
    if (out.length) return truncate(out.join("\n"));
    // Nothing logged: fall back to the script's final value, if it produced one.
    if (value !== undefined) return truncate(stringify(value));
    return "(script produced no output — call console.log(...) to return a result)";
  } finally {
    // Order matters: all handles above are disposed before we get here, so the context
    // and runtime tear down cleanly (quickjs-emscripten complains about leaked handles).
    ctx.dispose();
    runtime.dispose();
  }
}

// Give the sandbox a minimal `console` whose log/error/warn/info/debug all append a line
// to our buffer. This is the ONLY host capability the script receives.
function installConsole(ctx: QuickJSContext, out: string[]): void {
  const logFn = ctx.newFunction("log", (...handles) => {
    out.push(handles.map((h) => stringifyHandle(ctx, h)).join(" "));
  });
  const consoleObj = ctx.newObject();
  for (const method of ["log", "error", "warn", "info", "debug"]) {
    ctx.setProp(consoleObj, method, logFn); // setProp dups the ref; one host handle to free
  }
  ctx.setProp(ctx.global, "console", consoleObj);
  consoleObj.dispose();
  logFn.dispose();
}

// Convert a VM handle to a display string. `dump` copies the value out of the VM; we
// never keep a handle, so there's nothing extra to dispose here.
function stringifyHandle(ctx: QuickJSContext, handle: QuickJSHandle): string {
  let value: unknown;
  try {
    value = ctx.dump(handle);
  } catch {
    return "[unserializable]";
  }
  return stringify(value);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  if (typeof value === "object" && value !== null) {
    const o = value as Record<string, unknown>;
    // Error-like objects JSON.stringify to "{}" (non-enumerable props), so format them.
    if (typeof o.name === "string" && typeof o.message === "string") {
      return `${o.name}: ${o.message}`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value); // circular / non-serialisable
    }
  }
  return String(value);
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + `\n… [output truncated at ${MAX_OUTPUT_CHARS} chars]`;
}
