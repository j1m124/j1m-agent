import { useState, type FormEvent } from "react";
import { submitPassword } from "../store";

// Password gate. Shown only when the deployment requires a password (bootstrapAuth
// skips it otherwise) and after a 401. Entry is granted only if the SERVER confirms
// the password — a wrong one is rejected here, not on the first message.
export function Gate() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const ok = await submitPassword(value);
    // On success the store flips `authed` and ChatApp unmounts this gate.
    if (!ok) {
      setError("Incorrect password.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 supports-[min-height:100dvh]:min-h-dvh">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-lg font-semibold">j1m-agent</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Enter the access password to continue.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Password"
          aria-invalid={error ? true : undefined}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-50 hover:bg-neutral-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          {submitting ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
