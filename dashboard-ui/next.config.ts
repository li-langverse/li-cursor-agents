import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: root,
  reactStrictMode: true,
  // Read APIs: app/api/[[...path]]/route.ts → dist/db-api (GET only).
  // LI_AGENT_API_URL is only used when a route is not native (mutations, lanes, spawn).
};

export default nextConfig;
