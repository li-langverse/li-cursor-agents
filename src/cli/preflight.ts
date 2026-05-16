#!/usr/bin/env node
import { resolveBenchmarksRoot, runPreflight } from "../preflight.js";

const benchmarks = resolveBenchmarksRoot(process.argv[2]);
const bundle = runPreflight(benchmarks, true);
console.log(JSON.stringify(bundle, null, 2));
