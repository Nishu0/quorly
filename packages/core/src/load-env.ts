/**
 * Loads the repo-root .env regardless of which directory a script was started
 * from. Bun auto-loads .env from the *current* working directory, so
 * `bun run --cwd packages/core seed` finds nothing — this walks up until it
 * does. Existing environment variables always win.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findEnvFile(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

let loaded = false;

export function loadEnv(from: string = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  const file = findEnvFile(from);
  if (!file) return;

  for (const rawLine of readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();
