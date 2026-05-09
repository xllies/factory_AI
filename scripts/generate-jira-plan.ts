#!/usr/bin/env node
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const child = spawn("node", ["--import", "tsx", "scripts/dark-factory.ts", "plan", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
