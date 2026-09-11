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

/**
 * A quoted value ends at its closing quote — anything after it is a trailing
 * comment, not part of the secret. Getting this wrong silently appends
 * `" # Socket Mode` to a token and surfaces much later as an auth failure.
 */
export function parseValue(raw: string): string {
  const value = raw.trim();
  const quote = value[0];

  if (quote === '"' || quote === "'") {
    const close = value.indexOf(quote, 1);
    if (close !== -1) return value.slice(1, close);
    return value.slice(1).trim(); // unterminated quote: salvage the rest
  }

  const comment = value.search(/\s#/);
  return (comment === -1 ? value : value.slice(0, comment)).trim();
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

    process.env[key] = parseValue(line.slice(eq + 1));
  }
}

loadEnv();
