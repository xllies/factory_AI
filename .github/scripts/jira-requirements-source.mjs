import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const env = process.env;

const issueKey = requireEnv("ISSUE_KEY");
const jiraBaseUrl = requireEnv("JIRA_BASE_URL").replace(/\/+$/, "");
const jiraEmail = requireEnv("JIRA_EMAIL");
const jiraToken = requireEnv("JIRA_API_TOKEN");
const outputPath = env.REQUIREMENTS_OUT || "output/requirements-from-jira.md";

const headers = {
  Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const issue = await fetchJson(
  `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,description,status,assignee,reporter,priority,labels,components,comment&expand=renderedFields`,
  { headers },
);

const markdown = buildRequirementsMarkdown(issue, issueKey);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, markdown, "utf8");
console.log(`Wrote Jira requirements markdown: ${outputPath}`);

function requireEnv(name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}: ${body}`);
  }
  return response.json();
}

function buildRequirementsMarkdown(issue, issueKeyValue) {
  const fields = issue.fields ?? {};
  const summary = fields.summary || issueKeyValue;
  const description = adfToMarkdown(fields.description).trim() || "_No description provided._";
  const labels = (fields.labels ?? []).join(", ");
  const components = (fields.components ?? []).map((c) => c.name).join(", ");

  const comments = (fields.comment?.comments ?? []).map((c) => {
    const author = c.author?.displayName || "Unknown";
    const body = adfToMarkdown(c.body).trim() || "_Empty_";
    return `### ${author}\n\n${body}`;
  });

  return [
    `# ${summary}`,
    "",
    "## Ticket Metadata",
    "",
    `- Jira key: ${issueKeyValue}`,
    `- Status: ${fields.status?.name || "-"}`,
    `- Priority: ${fields.priority?.name || "-"}`,
    `- Assignee: ${fields.assignee?.displayName || "-"}`,
    `- Reporter: ${fields.reporter?.displayName || "-"}`,
    `- Labels: ${labels || "-"}`,
    `- Components: ${components || "-"}`,
    "",
    "## Requirements",
    "",
    description,
    "",
    "## Comments",
    "",
    comments.length ? comments.join("\n\n") : "_No comments._",
    "",
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
