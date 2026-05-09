#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import Ajv from "ajv";

type Complexity = "small" | "medium" | "large";
type Priority = "low" | "medium" | "high";

type PlanSubtask = {
  title: string;
  description: string;
  acceptance_criteria: string[];
  source_sections?: string[];
};

type PlanTask = {
  title: string;
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
  priority: Priority;
  complexity: Complexity;
  source_sections?: string[];
  subtasks: PlanSubtask[];
};

type PlanEpic = {
  title: string;
  description: string;
  source_sections: string[];
  tasks: PlanTask[];
};

type JiraPlan = {
  source_file: string;
  summary: string;
  open_questions: string[];
  epics: PlanEpic[];
};

type Section = {
  heading: string;
  level: number;
  content: string[];
};

type JiraCredentials = {
  baseUrl: string;
  authHeader: string;
};

type CreatedIssue = {
  key: string;
  url: string;
  type: "Epic" | "Task" | "Subtask";
  title: string;
  parentKey?: string;
  fingerprint: string;
};

const DEFAULT_SOURCE = "specs/product-requirements.md";
const DEFAULT_PLAN_OUTPUT = "output/generated-plan.json";
const DEFAULT_LEDGER_OUTPUT = "output/applied-issues.json";
const SCHEMA_PATH = "schemas/jira-plan.schema.json";

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "plan") {
    await runPlanCommand(args);
    return;
  }

  if (command === "apply") {
    await runApplyCommand(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function printHelp() {
  console.log(
    [
      "dark-factory CLI",
      "",
      "Commands:",
      "  dark-factory plan [source.md] [--out output/generated-plan.json]",
      "  dark-factory apply [output/generated-plan.json] --project KAN [--approve] [--out output/applied-issues.json]",
      "",
      "Environment for apply:",
      "  JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN",
    ].join("\n"),
  );
}

function readArgValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i >= 0 && i + 1 < args.length) {
    return args[i + 1];
  }
  return undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function firstPositional(args: string[]): string | undefined {
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (current === "--out" || current === "--project") {
      i += 1;
      continue;
    }
    if (!current.startsWith("--")) {
      positionals.push(current);
    }
  }
  return positionals[0];
}

async function runPlanCommand(args: string[]) {
  const source = firstPositional(args) ?? DEFAULT_SOURCE;
  const outputPath = readArgValue(args, "--out") ?? DEFAULT_PLAN_OUTPUT;
  const schema = await readJson(SCHEMA_PATH);
  const markdown = await readText(source);
  const plan = buildPlanFromMarkdown(markdown, source);
  validatePlan(plan, schema);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(`Generated plan: ${outputPath}`);
  console.log(`Epics: ${plan.epics.length}, Open questions: ${plan.open_questions.length}`);
}

async function runApplyCommand(args: string[]) {
  const inputPlan = firstPositional(args) ?? DEFAULT_PLAN_OUTPUT;
  const projectKey = readArgValue(args, "--project");
  const approve = hasFlag(args, "--approve");
  const ledgerPath = readArgValue(args, "--out") ?? DEFAULT_LEDGER_OUTPUT;
  const schema = await readJson(SCHEMA_PATH);

  if (!projectKey) {
    throw new Error("Missing required flag: --project <JIRA_PROJECT_KEY>");
  }

  const plan = (await readJson(inputPlan)) as JiraPlan;
  validatePlan(plan, schema);

  const preflight = summarizePlan(plan);
  console.log(preflight);
  if (!approve) {
    console.log("Dry run complete. Add --approve to create Jira issues.");
    return;
  }

  const creds = getJiraCredentials();
  await ensureProjectPreflight(creds, projectKey);

  const ledger = await readJsonOrDefault<{ created: CreatedIssue[] }>(ledgerPath, { created: [] });
  const created: CreatedIssue[] = [];

  for (const epic of plan.epics) {
    const epicFingerprint = fingerprintOf("Epic", plan.source_file, epic.title, epic.source_sections.join("|"));
    const existingEpic = ledger.created.find((x) => x.fingerprint === epicFingerprint);
    const epicIssue = existingEpic ?? (await createEpic(creds, projectKey, epic, epicFingerprint));
    if (!existingEpic) {
      created.push(epicIssue);
      console.log(`Created Epic ${epicIssue.key}: ${epicIssue.title}`);
    } else {
      console.log(`Reusing Epic ${epicIssue.key}: ${epicIssue.title}`);
    }

    for (const task of epic.tasks) {
      const taskFingerprint = fingerprintOf("Task", plan.source_file, epic.title, task.title, task.source_sections?.join("|") ?? "");
      const existingTask = ledger.created.find((x) => x.fingerprint === taskFingerprint);
      const taskIssue = existingTask ?? (await createTask(creds, projectKey, epicIssue.key, task, taskFingerprint));
      if (!existingTask) {
        created.push(taskIssue);
        console.log(`Created Task ${taskIssue.key}: ${taskIssue.title}`);
      } else {
        console.log(`Reusing Task ${taskIssue.key}: ${taskIssue.title}`);
      }

      for (const subtask of task.subtasks) {
        const subtaskFingerprint = fingerprintOf(
          "Subtask",
          plan.source_file,
          epic.title,
          task.title,
          subtask.title,
          subtask.source_sections?.join("|") ?? "",
        );
        const existingSubtask = ledger.created.find((x) => x.fingerprint === subtaskFingerprint);
        const subtaskIssue = existingSubtask ?? (await createSubtask(creds, projectKey, taskIssue.key, subtask, subtaskFingerprint));
        if (!existingSubtask) {
          created.push(subtaskIssue);
          console.log(`Created Subtask ${subtaskIssue.key}: ${subtaskIssue.title}`);
        } else {
          console.log(`Reusing Subtask ${subtaskIssue.key}: ${subtaskIssue.title}`);
        }
      }
    }
  }

  const merged = { created: [...ledger.created, ...created] };
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  await writeFile(ledgerPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  console.log("");
  console.log("Created issues summary:");
  for (const item of created) {
    console.log(`- ${item.key} (${item.type}) ${item.url}`);
  }
}

function summarizePlan(plan: JiraPlan): string {
  const taskCount = plan.epics.reduce((sum, epic) => sum + epic.tasks.length, 0);
  const subtaskCount = plan.epics.reduce(
    (sum, epic) => sum + epic.tasks.reduce((inner, task) => inner + task.subtasks.length, 0),
    0,
  );
  return [
    "Preflight summary",
    `- Source: ${plan.source_file}`,
    `- Epics: ${plan.epics.length}`,
    `- Tasks: ${taskCount}`,
    `- Subtasks: ${subtaskCount}`,
    `- Open questions: ${plan.open_questions.length}`,
  ].join("\n");
}

function buildPlanFromMarkdown(markdown: string, sourceFile: string): JiraPlan {
  const sections = parseSections(markdown);
  const title = firstHeading(markdown) ?? "Product requirements";
  const areaSections = sections.filter((s) => s.level === 3);
  const openQuestions = extractOpenQuestions(sections);
  const epics = buildEpics(areaSections, sections);

  return {
    source_file: sourceFile,
    summary: `Generated from ${title}.`,
    open_questions: openQuestions,
    epics,
  };
}

function parseSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      if (current) sections.push(current);
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: [],
      };
      continue;
    }

    if (!current) {
      current = { heading: "Document", level: 1, content: [] };
    }
    current.content.push(line);
  }

  if (current) sections.push(current);
  return sections;
}

function firstHeading(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractOpenQuestions(sections: Section[]): string[] {
  const items: string[] = [];

  for (const section of sections) {
    if (!section.heading.toLowerCase().includes("open question")) continue;
    for (const line of section.content) {
      const bullet = normalizeBullet(line);
      if (bullet) items.push(bullet);
    }
  }

  return items;
}

function buildEpics(areaSections: Section[], allSections: Section[]): PlanEpic[] {
  if (areaSections.length === 0) {
    return [
      {
        title: "Requirements Delivery",
        description: "Primary implementation area derived from product requirements.",
        source_sections: ["Document"],
        tasks: [defaultTask()],
      },
    ];
  }

  return areaSections.map((section) => {
    const bullets = section.content.map(normalizeBullet).filter(Boolean) as string[];
    const acceptance = findAcceptanceCriteriaForArea(section.heading, allSections);
    const taskSourceSections = [section.heading];

    const tasks: PlanTask[] = bullets.length
      ? bullets.map((bullet) => {
          const complexity = inferComplexity(bullet);
          return {
            title: capitalizeSentence(bullet),
            description: `Implement requirement: ${bullet}`,
            acceptance_criteria: acceptance.length ? acceptance : [`Requirement implemented: ${bullet}`],
            dependencies: [],
            priority: "medium",
            complexity,
            source_sections: taskSourceSections,
            subtasks: [
              {
                title: `Implement ${trimSentence(bullet, 40)}`,
                description: `Deliver code and configuration for: ${bullet}`,
                acceptance_criteria: [`Implementation complete for ${bullet}`],
                source_sections: taskSourceSections,
              },
              {
                title: `Validate ${trimSentence(bullet, 40)}`,
                description: `Validate behavior and quality for: ${bullet}`,
                acceptance_criteria: ["Verification checks pass."],
                source_sections: taskSourceSections,
              },
            ],
          };
        })
      : [defaultTask(section.heading)];

    return {
      title: section.heading,
      description: `Delivery for product area: ${section.heading}`,
      source_sections: [section.heading],
      tasks,
    };
  });
}

function findAcceptanceCriteriaForArea(areaHeading: string, sections: Section[]): string[] {
  const normalizedArea = areaHeading.toLowerCase();
  const criteria: string[] = [];

  for (const section of sections) {
    if (section.level < 3) continue;
    const heading = section.heading.toLowerCase();
    if (!heading.includes("acceptance")) continue;
    const relates = section.content.join("\n").toLowerCase().includes(normalizedArea) || heading.includes(normalizedArea);
    if (!relates) continue;
    for (const line of section.content) {
      const bullet = normalizeBullet(line);
      if (bullet) criteria.push(bullet);
    }
  }

  return criteria;
}

function defaultTask(sourceSection = "Document"): PlanTask {
  return {
    title: "Break down requirements into implementation tasks",
    description: "Create actionable implementation tasks from remaining requirements content.",
    acceptance_criteria: ["Requirements are mapped to executable Jira tasks."],
    dependencies: [],
    priority: "medium",
    complexity: "medium",
    source_sections: [sourceSection],
    subtasks: [
      {
        title: "Implement breakdown",
        description: "Create initial implementation task decomposition.",
        acceptance_criteria: ["Task decomposition exists."],
        source_sections: [sourceSection],
      },
      {
        title: "Validate breakdown",
        description: "Validate decomposition quality with acceptance criteria.",
        acceptance_criteria: ["Decomposition reviewed for completeness."],
        source_sections: [sourceSection],
      },
    ],
  };
}

function inferComplexity(text: string): Complexity {
  const t = text.toLowerCase();
  if (t.includes("integrat") || t.includes("orchestrat") || t.includes("multi")) return "large";
  if (t.includes("support") || t.includes("allow") || t.includes("create")) return "medium";
  return "small";
}

function normalizeBullet(line: string): string | null {
  const match = /^\s*[-*]\s+(.+)$/.exec(line);
  if (!match) return null;
  return match[1].trim();
}

function capitalizeSentence(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function trimSentence(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function validatePlan(plan: JiraPlan, schema: unknown) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(plan);
  if (valid) return;

  const details = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`).join("; ");
  throw new Error(`Plan validation failed: ${details}`);
}

function getJiraCredentials(): JiraCredentials {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) {
    throw new Error("Missing Jira env vars. Required: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN");
  }
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  return { baseUrl, authHeader };
}

async function ensureProjectPreflight(creds: JiraCredentials, projectKey: string) {
  const project = await jiraRequest<{ key: string }>(creds, `/rest/api/3/project/${encodeURIComponent(projectKey)}`);
  if (!project?.key) {
    throw new Error(`Project not accessible: ${projectKey}`);
  }

  const issueTypes = await jiraRequest<Array<{ name: string }>>(creds, "/rest/api/3/issuetype");
  const names = new Set(issueTypes.map((x) => x.name.toLowerCase()));
  for (const requiredType of ["epic", "task", "subtask"]) {
    if (!names.has(requiredType)) {
      throw new Error(`Required Jira issue type missing: ${requiredType}`);
    }
  }
}

async function createEpic(
  creds: JiraCredentials,
  projectKey: string,
  epic: PlanEpic,
  fingerprint: string,
): Promise<CreatedIssue> {
  const description = renderIssueDescription({
    summary: epic.description,
    acceptanceCriteria: epic.tasks.flatMap((t) => t.acceptance_criteria).slice(0, 8),
    sourceSections: epic.source_sections,
    dependencies: [],
    complexity: "large",
    priority: "medium",
  });

  const created = await jiraRequest<{ key: string }>(creds, "/rest/api/3/issue", {
    method: "POST",
    body: {
      fields: {
        project: { key: projectKey },
        issuetype: { name: "Epic" },
        summary: epic.title,
        description,
        labels: ["dark-factory-generated", `dfp-${fingerprint.slice(0, 12)}`],
      },
    },
  });

  return toCreatedIssue(creds.baseUrl, created.key, "Epic", epic.title, fingerprint);
}

async function createTask(
  creds: JiraCredentials,
  projectKey: string,
  epicKey: string,
  task: PlanTask,
  fingerprint: string,
): Promise<CreatedIssue> {
  const description = renderIssueDescription({
    summary: task.description,
    acceptanceCriteria: task.acceptance_criteria,
    sourceSections: task.source_sections ?? [],
    dependencies: task.dependencies,
    complexity: task.complexity,
    priority: task.priority,
  });

  const created = await jiraRequest<{ key: string }>(creds, "/rest/api/3/issue", {
    method: "POST",
    body: {
      fields: {
        project: { key: projectKey },
        issuetype: { name: "Task" },
        summary: task.title,
        description,
        parent: { key: epicKey },
        labels: ["dark-factory-generated", `dfp-${fingerprint.slice(0, 12)}`],
      },
    },
  });

  return { ...toCreatedIssue(creds.baseUrl, created.key, "Task", task.title, fingerprint), parentKey: epicKey };
}

async function createSubtask(
  creds: JiraCredentials,
  projectKey: string,
  taskKey: string,
  subtask: PlanSubtask,
  fingerprint: string,
): Promise<CreatedIssue> {
  const description = renderIssueDescription({
    summary: subtask.description,
    acceptanceCriteria: subtask.acceptance_criteria,
    sourceSections: subtask.source_sections ?? [],
    dependencies: [],
    complexity: "small",
    priority: "medium",
  });

  const created = await jiraRequest<{ key: string }>(creds, "/rest/api/3/issue", {
    method: "POST",
    body: {
      fields: {
        project: { key: projectKey },
        issuetype: { name: "Subtask" },
        summary: subtask.title,
        description,
        parent: { key: taskKey },
        labels: ["dark-factory-generated", `dfp-${fingerprint.slice(0, 12)}`],
      },
    },
  });

  return { ...toCreatedIssue(creds.baseUrl, created.key, "Subtask", subtask.title, fingerprint), parentKey: taskKey };
}

function renderIssueDescription(params: {
  summary: string;
  acceptanceCriteria: string[];
  sourceSections: string[];
  dependencies: string[];
  priority: Priority;
  complexity: Complexity;
}): { type: "doc"; version: 1; content: unknown[] } {
  const {
    summary,
    acceptanceCriteria,
    sourceSections,
    dependencies,
    priority,
    complexity,
  } = params;

  return {
    type: "doc",
    version: 1,
    content: [
      adfParagraph(summary),
      adfHeading("Acceptance Criteria", 3),
      ...(acceptanceCriteria.length ? [adfBulletList(acceptanceCriteria)] : [adfParagraph("None provided.")]),
      adfHeading("Source Reference", 3),
      ...(sourceSections.length ? [adfBulletList(sourceSections)] : [adfParagraph("Document root")]),
      adfHeading("Dependencies", 3),
      ...(dependencies.length ? [adfBulletList(dependencies)] : [adfParagraph("None")]),
      adfParagraph(`Suggested priority: ${priority}`),
      adfParagraph(`Estimated complexity: ${complexity}`),
    ],
  };
}

function adfParagraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function adfHeading(text: string, level: number) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function adfBulletList(items: string[]) {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [adfParagraph(item)],
    })),
  };
}

function toCreatedIssue(
  jiraBaseUrl: string,
  key: string,
  type: CreatedIssue["type"],
  title: string,
  fingerprint: string,
): CreatedIssue {
  return {
    key,
    type,
    title,
    fingerprint,
    url: `${jiraBaseUrl}/browse/${encodeURIComponent(key)}`,
  };
}

function fingerprintOf(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("::")).digest("hex");
}

async function jiraRequest<T>(
  creds: JiraCredentials,
  route: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${creds.baseUrl}${route}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: creds.authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira request failed [${response.status} ${response.statusText}] ${route}: ${body}`);
  }
  return (await response.json()) as T;
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readText(filePath);
  return JSON.parse(raw);
}

async function readJsonOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const value = await readJson(filePath);
    return value as T;
  } catch {
    return fallback;
  }
}

async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
