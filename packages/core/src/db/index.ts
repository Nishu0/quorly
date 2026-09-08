import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "../env";

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __quorly_db: Db | undefined;
}

function connect(): Db {
  const sql = postgres(env.databaseUrl(), { max: 5 });
  return drizzle(sql, { schema });
}

/**
 * Lazy on purpose: Next.js imports every route module at build time, and we
 * don't want a missing DATABASE_URL to fail the build for pages that are all
 * `force-dynamic` anyway.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    globalThis.__quorly_db ??= connect();
    return Reflect.get(globalThis.__quorly_db as object, prop, receiver);
  },
});

export { schema };
export * from "./schema";
