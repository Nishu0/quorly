import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@quorly/core"],
  serverExternalPackages: ["postgres"],
};

export default config;
