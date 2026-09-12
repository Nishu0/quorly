import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Ships only the files actually reached, so the runtime image stays small.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default config;
