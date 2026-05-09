import { mkdir, readFile, writeFile, access, copyFile } from "node:fs/promises";
import { execSync } from "node:child_process";

// JSON.stringify is used as a safe shell-arg quoter for known-shape strings
// like Jira branch names; treat any string passed to execSync that way.

const mode = process.argv[2];
if (!mode) {
  throw new Error("Usage: jira-dispatch.mjs <prepare-dispatch|record-run|commit-changes|ensure-pr|comment-result|transition-done>");
}

const env = process.env;

let jiraBaseUrl;
let jiraHeaders;

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  if (mode === "prepare-dispatch") return prepareDispatch();
  if (mode === "record-run") return recordRun();
  if (mode === "commit-changes") return commitChanges();
  if (mode === "ensure-pr") return ensurePr();
  if (mode === "comment-result") return commentResult();
  if (mode === "transition-done") return transitionDone();
  throw new Error(`Unknown mode: ${mode}`);
}

function requireEnv(name) {
  const v = env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function initJira() {
  const baseUrl = requireEnv("JIRA_BASE_URL").replace(/\/+$/, "");
  const email = requireEnv("JIRA_EMAIL");
  const token = requireEnv("JIRA_API_TOKEN");
  jiraBaseUrl = baseUrl;
  jiraHeaders = {
    Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}: ${body}`);
  }
  return response.json();
}

async function transitionToCategory(key, issue, { skipCategories, categoryKey, nameMatchers, label }) {
  const category = lower(issue?.fields?.status?.statusCategory?.key);
  if (skipCategories.includes(category)) {
    console.log(`Skipping ${label} transition for ${key}: status category is "${category}".`);
    return;
  }

  let transitions;
  try {
    const data = await fetchJson(
      `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
      { headers: jiraHeaders },
    );
    transitions = Array.isArray(data?.transitions) ? data.transitions : [];
  } catch (err) {
    console.warn(`Failed to fetch transitions for ${key}: ${err.message}`);
    return;
  }

  const target =
    transitions.find((t) => lower(t?.to?.statusCategory?.key) === categoryKey) ||
    transitions.find((t) => nameMatchers.includes(lower(t?.name)));

  if (!target) {
    console.warn(`No "${label}" transition available for ${key}; continuing without status change.`);
    return;
  }

  try {
    const response = await fetch(
      `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
      {
        method: "POST",
        headers: jiraHeaders,
        body: JSON.stringify({ transition: { id: target.id } }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`Failed to transition ${key} via "${target.name}" (id=${target.id}): HTTP ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`);
      return;
    }
    console.log(`Transitioned ${key} to ${label} via "${target.name}" (id=${target.id}).`);
  } catch (err) {
    console.warn(`Failed to transition ${key} via "${target.name}" (id=${target.id}): ${err.message}`);
  }
}

async function transitionToInProgress(key, issue) {
  return transitionToCategory(key, issue, {
    skipCategories: ["indeterminate", "done"],
    categoryKey: "indeterminate",
    nameMatchers: ["in progress"],
    label: "In Progress",
  });
}

async function transitionToDone(key, issue) {
  return transitionToCategory(key, issue, {
    skipCategories: ["done"],
    categoryKey: "done",
    nameMatchers: ["done", "resolved", "closed"],
    label: "Done",
  });
}

async function transitionDone() {
  initJira();
  const key = normalizeIssueKey(requireEnv("ISSUE_KEY"));
  let issue;
  try {
    issue = await fetchJson(
      `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=status`,
      { headers: jiraHeaders },
    );
  } catch (err) {
    console.warn(`Failed to fetch issue ${key} for Done transition: ${err.message}`);
    return;
  }
  await transitionToDone(key, issue);
}

async function appendGithubEnv(values) {
  const file = env.GITHUB_ENV;
  if (!file) return;
  const body = Object.entries(values)
    .map(([k, v]) => {
      const s = String(v ?? "");
      if (s.includes("\n")) return `${k}<<EOF_${k}\n${s}\nEOF_${k}`;
      return `${k}=${s}`;
    })
    .join("\n");
  await writeFile(file, body + "\n", { flag: "a" });
}

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOrEmpty(p) {
  try {
    const raw = await readFile(p, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function nowIso() {
  return new Date().toISOString();
}

function compactStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function lower(s) {
  return String(s ?? "").toLowerCase();
}

function tableRow(value) {
  return String(value || "-").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function normalizeIssueKey(key) {
  const normalized = String(key || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(normalized)) {
    throw new Error(`Invalid Jira issue key: ${key}`);
  }
  return normalized;
}

function determineKind(issue) {
  const labels = (issue.fields?.labels ?? []).map(lower);
  if (labels.includes("claude:answer")) return "answer";
  if (labels.includes("claude:pr")) return "pr";
  const type = lower(issue.fields?.issuetype?.name);
  if (type === "question") return "answer";
  return "pr";
}

async function prepareDispatch() {
  initJira();
  const key = normalizeIssueKey(requireEnv("ISSUE_KEY"));

  const issue = await fetchJson(
    `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,status,assignee,reporter,priority,issuetype,labels,components,created,updated,comment&expand=renderedFields`,
    { headers: jiraHeaders },
  );

  await transitionToInProgress(key, issue);

  const fields = issue.fields ?? {};
  const summary = fields.summary || key;
  const kind = determineKind(issue);
  const branchName = `tdf/${key.toLowerCase()}`;

  // For PR mode, switch to the existing PR branch if one exists on origin so
  // that prior state.json, plan.md, transcript.md, and any code changes are
  // visible to this run. Done before any file writes to avoid untracked-file
  // collisions with `git checkout`.
  if (kind === "pr") {
    let branchExists = false;
    try {
      execSync(`git ls-remote --exit-code --heads origin ${JSON.stringify(branchName)}`, { stdio: "ignore" });
      branchExists = true;
    } catch {
      branchExists = false;
    }
    if (branchExists) {
      console.log(`Existing branch ${branchName} found on origin; checking out.`);
      execSync(`git fetch origin ${JSON.stringify(branchName)}`, { stdio: "inherit" });
      execSync(`git checkout -B ${JSON.stringify(branchName)} origin/${branchName}`, { stdio: "inherit" });
    } else {
      console.log(`No existing branch ${branchName}; will create from main on commit.`);
    }
  }

  const ticketFolder = `spec/${key}`;
  const stateFile = `${ticketFolder}/state.json`;
  const transcriptFile = `${ticketFolder}/transcript.md`;
  const specFile = `${ticketFolder}/spec.md`;
  const planFile = `${ticketFolder}/plan.md`;
  const responseFile = `${ticketFolder}/response.md`;
  const runDir = `${ticketFolder}/runs/${compactStamp()}-${env.GITHUB_RUN_ID || "local"}`;
  const promptFile = `${runDir}/prompt.md`;

  await mkdir(runDir, { recursive: true });

  let isNew = true;
  let lastSessionId = "";
  if (await pathExists(stateFile)) {
    isNew = false;
    const state = await readJsonOrEmpty(stateFile);
    lastSessionId = state.last_session_id || "";
  } else {
    await writeFile(
      stateFile,
      JSON.stringify({ ticket_id: key, run_count: 0, kind, branch: branchName }, null, 2) + "\n",
      "utf8",
    );
  }

  if (!(await pathExists(transcriptFile))) {
    await writeFile(transcriptFile, `# ${key} Transcript\n`, "utf8");
  }

  const comments = issue.fields?.comment?.comments ?? [];
  await writeFile(specFile, buildSpec({ issue, comments, key }), "utf8");

  const prompt = buildPrompt({
    key,
    summary,
    ticketFolder,
    kind,
    isNew,
    specFile,
    planFile,
    responseFile,
    transcriptFile,
  });
  await writeFile(promptFile, prompt, "utf8");

  let claudeArgs = "--max-turns 60 --permission-mode bypassPermissions";
  if (lastSessionId) claudeArgs += ` --resume ${lastSessionId}`;

  await mkdir(`${requireEnv("HOME")}/.claude/projects`, { recursive: true });

  await appendGithubEnv({
    SHOULD_RUN: "true",
    ISSUE_KEY: key,
    ISSUE_TITLE: summary,
    JIRA_ISSUE_URL: `${jiraBaseUrl}/browse/${key}`,
    KIND: kind,
    BRANCH_NAME: branchName,
    IS_NEW: isNew ? "true" : "false",
    LAST_SESSION_ID: lastSessionId,
    TICKET_FOLDER: ticketFolder,
    STATE_FILE: stateFile,
    TRANSCRIPT_FILE: transcriptFile,
    SPEC_FILE: specFile,
    PLAN_FILE: planFile,
    RESPONSE_FILE: responseFile,
    RUN_DIR: runDir,
    PROMPT_FILE: promptFile,
    CLAUDE_ARGS: claudeArgs,
  });

  console.log(`Prepared dispatch for ${key} (kind=${kind} new=${isNew} last_session=${lastSessionId || "<none>"})`);
}

async function recordRun() {
  const stateFile = requireEnv("STATE_FILE");
  const transcriptFile = requireEnv("TRANSCRIPT_FILE");
  const responseFile = env.RESPONSE_FILE || "";
  const promptFile = env.PROMPT_FILE || "";
  const runDir = env.RUN_DIR || "";
  const isNew = env.IS_NEW === "true";
  const kind = env.KIND || "pr";
  const conclusion = env.CONCLUSION || "unknown";
  const lastSessionId = env.LAST_SESSION_ID || "";
  const actionSessionId = env.ACTION_SESSION_ID || "";
  const executionFile = env.EXECUTION_FILE || "";

  let newSessionId = actionSessionId;
  let assistantText = "";

  if (executionFile && (await pathExists(executionFile))) {
    try {
      const raw = await readFile(executionFile, "utf8");
      const entries = parseExecutionFile(raw);
      if (!newSessionId) {
        for (const e of entries) {
          if (e?.session_id) newSessionId = e.session_id;
        }
      }
      for (const e of entries) {
        if (e?.type === "assistant") {
          for (const part of e?.message?.content ?? []) {
            if (part?.type === "text" && typeof part.text === "string") {
              assistantText = part.text;
            }
          }
        }
      }
      if (runDir) {
        await mkdir(runDir, { recursive: true });
        await copyFile(executionFile, `${runDir}/execution.json`);
      }
    } catch (err) {
      console.warn(`Failed to parse execution_file: ${err.message}`);
    }
  }

  if (runDir) {
    if (responseFile && (await pathExists(responseFile))) {
      await copyFile(responseFile, `${runDir}/response.md`);
    }
    if (promptFile && (await pathExists(promptFile))) {
      await copyFile(promptFile, `${runDir}/prompt.md`);
    }
  }

  const now = nowIso();
  const rotated = lastSessionId && newSessionId && lastSessionId !== newSessionId;

  const state = await readJsonOrEmpty(stateFile);
  state.ticket_id = state.ticket_id || env.ISSUE_KEY || "";
  state.last_session_id = newSessionId || "";
  state.prev_session_id = lastSessionId || null;
  state.last_run_at = now;
  state.last_conclusion = conclusion;
  state.last_kind = kind;
  state.run_count = (state.run_count || 0) + 1;
  if (env.BRANCH_NAME) state.branch = env.BRANCH_NAME;
  state.kind = kind;
  await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n", "utf8");

  const summarySnippet = (assistantText || "").trim().split("\n").slice(0, 12).join("\n  ");
  const block = [
    "",
    `## Run ${now}`,
    `- run_kind: ${isNew ? "new" : "continuation"}`,
    `- prev_session_id: ${lastSessionId || "<none>"}`,
    `- new_session_id: ${newSessionId || "<none>"}`,
    `- session_id_rotated: ${rotated ? "true" : "false"}`,
    `- conclusion: ${conclusion}`,
    `- run_dir: ${runDir || "<none>"}`,
    `- assistant_summary:\n  ${summarySnippet || "<empty>"}`,
    "",
  ].join("\n");
  await writeFile(transcriptFile, block, { flag: "a" });

  await appendGithubEnv({ NEW_SESSION_ID: newSessionId });
  console.log(`Recorded run for ${env.ISSUE_KEY}: session=${newSessionId || "<none>"}`);
}

function parseExecutionFile(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      return Array.isArray(arr) ? arr : [];
    } catch {
      // fall through to NDJSON
    }
  }
  return trimmed
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function commitChanges() {
  const kind = env.KIND || "pr";
  const branchName = requireEnv("BRANCH_NAME");
  const issueKey = requireEnv("ISSUE_KEY");
  const ticketFolder = requireEnv("TICKET_FOLDER");
  const runId = env.GITHUB_RUN_ID || "";

  sh("rm -f output.txt");
  sh('git config user.name "github-actions[bot]"');
  sh('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');

  if (kind === "pr") {
    sh(`git checkout -B "${branchName}"`);
    sh("git add -A");
    if (gitNothingStaged()) {
      console.log("No changes to commit on PR branch");
      return appendGithubEnv({ COMMITTED: "false" });
    }
    sh(`git commit -m "${issueKey}: claude-code update (run ${runId})"`);
    sh(`git push origin "HEAD:${branchName}"`);
    return appendGithubEnv({ COMMITTED: "true" });
  }

  sh(`git add -A "${ticketFolder}"`);
  if (gitNothingStaged()) {
    console.log("No artefact changes to commit on main");
    return appendGithubEnv({ COMMITTED: "false" });
  }
  sh(`git commit -m "${issueKey}: update ticket artefacts (run ${runId})"`);
  sh("git push origin HEAD:main");
  return appendGithubEnv({ COMMITTED: "true" });
}

function gitNothingStaged() {
  try {
    execSync("git diff --cached --quiet", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sh(cmd) {
  execSync(cmd, { stdio: ["ignore", "inherit", "inherit"] });
}

async function ensurePr() {
  if ((env.KIND || "pr") !== "pr") {
    console.log("Not PR mode, skipping ensure-pr");
    return;
  }
  if (env.COMMITTED !== "true") {
    console.log("No commit happened on this run; skipping PR.");
    return;
  }

  const issueKey = requireEnv("ISSUE_KEY");
  const issueTitle = env.ISSUE_TITLE || issueKey;
  const branchName = requireEnv("BRANCH_NAME");
  const repo = requireEnv("GITHUB_REPOSITORY");
  const repoOwner = repo.split("/")[0];
  const ghToken = requireEnv("GH_TOKEN");

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${ghToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "tdf-dispatch",
  };

  const listUrl = `https://api.github.com/repos/${repo}/pulls?state=open&base=main&head=${repoOwner}:${branchName}`;
  const existing = await fetchJson(listUrl, { headers });
  let prUrl = (Array.isArray(existing) && existing[0] && existing[0].html_url) || "";

  if (!prUrl) {
    const body = [
      `Automated Claude Code update for ${issueKey}.`,
      "",
      `Jira: ${env.JIRA_ISSUE_URL || ""}`,
      `Ticket folder: \`${env.TICKET_FOLDER || ""}\``,
      "",
      "Review and merge when ready.",
    ].join("\n");

    const created = await fetchJson(`https://api.github.com/repos/${repo}/pulls`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${issueKey}: ${issueTitle}`,
        head: branchName,
        base: "main",
        body,
      }),
    });
    prUrl = created.html_url;
  }

  await appendGithubEnv({ PR_URL: prUrl });
  console.log(`Pull request: ${prUrl}`);
}

async function commentResult() {
  initJira();
  const issueKey = requireEnv("ISSUE_KEY");
  const kind = env.KIND || "pr";
  const branchName = env.BRANCH_NAME || "";
  const responseFile = env.RESPONSE_FILE || "";
  const stateFile = env.STATE_FILE || "";
  const repo = env.GITHUB_REPOSITORY || "";
  const prUrl = env.PR_URL || "";
  let conclusion = env.CONCLUSION || "";
  if (!conclusion && stateFile) {
    const state = await readJsonOrEmpty(stateFile);
    conclusion = state.last_conclusion || "unknown";
  }
  if (!conclusion) conclusion = "unknown";

  const content = [];

  if (kind === "pr") {
    content.push(paragraph(`[TDF-bot] Claude Code processed ${issueKey} (conclusion: ${conclusion}).`));
    if (branchName && repo) {
      content.push(linkParagraph("Branch", `https://github.com/${repo}/tree/${encodeURIComponent(branchName)}`));
    }
    if (prUrl) content.push(linkParagraph("Pull request", prUrl));
    if (env.COMMITTED === "false") {
      content.push(paragraph("No repository changes were committed on this run."));
    }
    if (responseFile && (await pathExists(responseFile))) {
      const text = (await readFile(responseFile, "utf8")).trim();
      if (text) content.push(...markdownToAdfBlocks(text));
    }
  } else {
    content.push(paragraph(`[TDF-bot] Claude Code answer for ${issueKey} (conclusion: ${conclusion}):`));
    if (responseFile && (await pathExists(responseFile))) {
      const text = (await readFile(responseFile, "utf8")).trim();
      if (text) content.push(...markdownToAdfBlocks(text));
      else content.push(paragraph("_Empty response._"));
    } else {
      content.push(paragraph("_No response file produced._"));
    }
  }

  await fetchJson(`${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    method: "POST",
    headers: jiraHeaders,
    body: JSON.stringify({ body: { type: "doc", version: 1, content } }),
  });
  console.log(`Posted comment to ${issueKey}`);
}

function paragraph(text) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function linkParagraph(label, href) {
  return {
    type: "paragraph",
    content: [
      { type: "text", text: `${label}: ` },
      { type: "text", text: href, marks: [{ type: "link", attrs: { href } }] },
    ],
  };
}

function markdownToAdfBlocks(text) {
  const blocks = String(text)
    .slice(0, 30000)
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n");
    return {
      type: "paragraph",
      content: lines.flatMap((line, i) => [
        ...(i === 0 ? [] : [{ type: "hardBreak" }]),
        { type: "text", text: line },
      ]),
    };
  });
}

function buildSpec({ issue, comments, key }) {
  const fields = issue.fields ?? {};
  const description = adfToMarkdown(fields.description).trim() || "_No description provided._";
  const renderedComments = (comments ?? []).map((c) => {
    const author = c.author?.displayName || "<unknown>";
    const created = c.created || "";
    const body = adfToMarkdown(c.body).trim() || "_<empty>_";
    return `### ${author} on ${created}\n\n${body}`;
  });
  return [
    `# ${key}: ${fields.summary ?? "Untitled Jira issue"}`,
    "",
    `Generated from Jira on ${nowIso()}.`,
    "",
    "## Issue Details",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Key | ${tableRow(key)} |`,
    `| Title | ${tableRow(fields.summary)} |`,
    `| Type | ${tableRow(fields.issuetype?.name)} |`,
    `| Status | ${tableRow(fields.status?.name)} |`,
    `| Priority | ${tableRow(fields.priority?.name)} |`,
    `| Assignee | ${tableRow(fields.assignee?.displayName)} |`,
    `| Reporter | ${tableRow(fields.reporter?.displayName)} |`,
    `| Labels | ${tableRow((fields.labels ?? []).join(", "))} |`,
    `| Components | ${tableRow((fields.components ?? []).map((c) => c.name).join(", "))} |`,
    `| Created | ${tableRow(fields.created)} |`,
    `| Updated | ${tableRow(fields.updated)} |`,
    "",
    "## Description",
    "",
    description,
    "",
    `## Comments (${(comments ?? []).length})`,
    "",
    renderedComments.length ? renderedComments.join("\n\n") : "_No comments._",
    "",
  ].join("\n");
}

function buildPrompt({ key, summary, ticketFolder, kind, isNew, specFile, planFile, responseFile, transcriptFile }) {
  const goal =
    kind === "pr"
      ? [
          "- Make the smallest correct repository changes to satisfy the ticket.",
          `- Update \`${planFile}\` with the implementation plan.`,
          `- Write a concise Jira-facing summary to \`${responseFile}\` (what changed, why, risks). Do not include logs or secrets.`,
          "- Do not create or merge pull requests; the workflow does that.",
        ].join("\n")
      : [
          `- Do not edit any file outside \`${ticketFolder}\`.`,
          `- Update \`${planFile}\` with reasoning if it helps.`,
          `- Write the complete answer to \`${responseFile}\` in markdown that renders correctly in Jira.`,
        ].join("\n");

  const continuationNote = isNew
    ? ""
    : `- This is a continuation. If your in-memory session is missing, rebuild context from \`${transcriptFile}\`, \`${planFile}\`, and the \`runs/\` folder under the ticket.\n`;

  return [
    `You are running inside \`${env.GITHUB_REPOSITORY}\` for Jira ticket \`${key}: ${summary}\`.`,
    "",
    "Read `CLAUDE.md` for repository conventions before touching files.",
    "",
    `Ticket folder: \`${ticketFolder}\`.`,
    `- \`${specFile}\`: a fresh snapshot of the Jira ticket and its comments. Read it. Do not edit it.`,
    `- \`${planFile}\`: implementation plan. You own this file. Update it as you go.`,
    `- \`${transcriptFile}\`: rolling history of prior runs. Read it for context if needed.`,
    `- \`${responseFile}\`: the message that will be posted back to Jira. You own this file.`,
    "",
    `Run kind: \`${kind}\` (${kind === "pr" ? "expects code/config changes plus a PR" : "answer-only, no code changes outside the ticket folder"}).`,
    `Run mode: \`${isNew ? "NEW" : "CONTINUATION"}\`.`,
    "",
    "Goal:",
    goal,
    "",
    "Constraints:",
    "- Never expose, print, or commit secrets.",
    "- Do not switch branches.",
    "- Keep tool usage minimal.",
    continuationNote,
  ].join("\n");
}

function adfToMarkdown(node) {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(adfToMarkdown).join("");

  switch (node.type) {
    case "doc":
      return blockContent(node).join("\n\n");
    case "paragraph":
      return inlineContent(node);
    case "heading":
      return `${"#".repeat(node.attrs?.level ?? 2)} ${inlineContent(node)}`;
    case "bulletList":
      return listContent(node, "-");
    case "orderedList":
      return orderedListContent(node);
    case "listItem":
      return blockContent(node).join("\n");
    case "blockquote":
      return blockContent(node)
        .join("\n")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "codeBlock":
      return `\`\`\`\n${textContent(node)}\n\`\`\``;
    case "rule":
      return "---";
    case "hardBreak":
      return "\n";
    case "text":
      return applyMarks(node.text ?? "", node.marks ?? []);
    default:
      return blockContent(node).join("\n");
  }
}

function blockContent(node) {
  return (node.content ?? []).map(adfToMarkdown).filter(Boolean);
}

function inlineContent(node) {
  return (node.content ?? []).map(adfToMarkdown).join("");
}

function listContent(node, marker) {
  return (node.content ?? [])
    .map((item) =>
      adfToMarkdown(item)
        .split("\n")
        .map((line, idx) => (idx === 0 ? `${marker} ${line}` : `  ${line}`))
        .join("\n"),
    )
    .join("\n");
}

function orderedListContent(node) {
  const start = node.attrs?.order ?? 1;
  return (node.content ?? [])
    .map((item, idx) =>
      adfToMarkdown(item)
        .split("\n")
        .map((line, lineIdx) => (lineIdx === 0 ? `${start + idx}. ${line}` : `   ${line}`))
        .join("\n"),
    )
    .join("\n");
}

function textContent(node) {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textContent).join("");
}

function applyMarks(text, marks) {
  return marks.reduce((value, mark) => {
    switch (mark.type) {
      case "strong":
        return `**${value}**`;
      case "em":
        return `_${value}_`;
      case "code":
        return `\`${value}\``;
      case "link":
        return `[${value}](${mark.attrs?.href ?? value})`;
      default:
        return value;
    }
  }, text);
}
