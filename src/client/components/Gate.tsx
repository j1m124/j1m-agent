import { useState } from "react";
import { setPassword } from "../store";

// Password gate. Shown on first load (no j1m:auth) and again after a 401. If the
// server has no APP_PASSWORD set, submit blank to pass through.
export function Gate() {
  const [value, setValue] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPassword(value);
        }}
        className="w-full max-w-sm space-y-4"
      >
        <div>
          <h1 className="text-lg font-semibold">j1m-agent</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Enter the access password. Leave blank if the server has none set.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-50 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
