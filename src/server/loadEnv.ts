// Minimal .env loader for local dev. Bun auto-loads .env for `bun run scripts/...`,
// but the Vite dev server runs under Node, which doesn't. In production (Render) the
// platform injects real env vars and no .env exists, so this is a harmless no-op.
// Only fills vars that aren't already set.
import { readFileSync } from "node:fs";

try {
  const text = readFileSync(".env", "utf-8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (!key || process.env[key] !== undefined) continue;
    let val = (m[2] ?? "").trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
} catch {
  // no .env file present — expected in production
}
