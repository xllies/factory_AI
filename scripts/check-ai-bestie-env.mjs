#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "POSTHOG_KEY",
  "POSTHOG_HOST",
  "RESEND_API_KEY",
  "APP_BASE_URL",
];

const optional = ["OPENAI_API_KEY", "OPENAI_MODEL"];

const envFile = resolve(process.cwd(), "apps/ai-bestie/.env.local");
const loaded = {};

if (existsSync(envFile)) {
  const rows = readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    loaded[key] = value;
  }
}

const missing = required.filter((name) => {
  const value = process.env[name] ?? loaded[name];
  return !value || String(value).trim() === "";
});

if (missing.length > 0) {
  if (!existsSync(envFile)) {
    console.error("File not found: apps/ai-bestie/.env.local");
  }
  console.error("Missing AI Bestie environment variables:");
  for (const name of missing) console.error(`- ${name}`);
  process.exit(1);
}

console.log("AI Bestie environment check passed.");
for (const key of optional) {
  const value = process.env[key] ?? loaded[key];
  if (!value || String(value).trim() === "") {
    console.warn(`Optional variable not set: ${key}`);
  }
}
