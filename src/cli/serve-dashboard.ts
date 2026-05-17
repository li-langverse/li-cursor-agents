#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { defaultOpsPort, startOpsServer } from "../ops-server.js";

function parsePort(argv: string[]): number {
  let port = defaultOpsPort();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" || argv[i] === "-p") port = Number(argv[++i]);
    if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: npm run dashboard [-- --port 9477]");
      process.exit(0);
    }
  }
  return port;
}

startOpsServer(parsePort(process.argv.slice(2)));
