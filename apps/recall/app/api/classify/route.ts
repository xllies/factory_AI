import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";
import type { ClassifyResult } from "@/lib/types";
import { parseDueAt } from "@/lib/datetime";

interface ClassifyRequest {
  text?: string;
  /** IANA timezone, e.g. "Europe/Athens". Sent by the client so dates resolve correctly. */
  timezone?: string;
}

const SYSTEM = `You are a personal capture assistant. Given raw text (spoken or typed), extract structured data.

Classify the input as exactly one type:
- "memory": something to remember (a fact, feeling, person, event, preference, observation)
- "action": something to do (task, reminder, goal, errand, appointment, meeting)

Return ONLY valid JSON with this exact shape:
{
  "type": "memory" | "action",
  "summary": string,
  "tags": string[],
  "dueAt": string | null,
  "location": string | null
}

Rules:
- summary: clean, concise restatement (1-2 sentences, third-person if memory, imperative if action)
- tags: 1-3 lowercase single-word tags relevant to the content
- dueAt: ISO 8601 datetime in the user's timezone (e.g. "2026-05-10T17:00:00+03:00") if a time was mentioned ("tomorrow at 5pm", "in 30 minutes", "next Tuesday", "tonight"). If no time was mentioned, null.
- location: short place name if explicitly mentioned ("at the gym", "in London"). Null otherwise.
- For "action" with no explicit time, dueAt is null - that's fine.
- For "memory", dueAt is almost always null unless the input is about a specific upcoming event.
- When in doubt about type, prefer "memory".`;

function heuristicClassify(text: string, timezone: string): ClassifyResult {
  const actionWords =
    /\b(do|call|send|remind|schedule|buy|fix|check|finish|email|text|book|pay|clean|write|read|make|pick up|follow up|research|review|prepare|update|contact|order|return|cancel|confirm|set up|look into|meet|meeting|appointment|deadline)\b/i;

  const type: ClassifyResult["type"] = actionWords.test(text) ? "action" : "memory";
  const due = parseDueAt(text, { now: new Date(), timezone });

  return {
    type,
    summary: text.trim(),
    tags: [],
    dueAt: due ? due.toISOString() : null,
    location: null,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ClassifyRequest;
  const text = body.text?.trim();
  const timezone = body.timezone || "UTC";

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(heuristicClassify(text, timezone));
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const now = new Date();
    const userMessage = `User timezone: ${timezone}
Current local time: ${now.toLocaleString("en-US", { timeZone: timezone })}
Current ISO time: ${now.toISOString()}

Input:
"""
${text}
"""`;

    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 300,
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ClassifyResult>;

    const result: ClassifyResult = {
      type: parsed.type === "action" ? "action" : "memory",
      summary: parsed.summary?.trim() || text.trim(),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [],
      dueAt: typeof parsed.dueAt === "string" ? parsed.dueAt : null,
      location: typeof parsed.location === "string" ? parsed.location : null,
    };

    // Sanity-check the dueAt - if the model returned something unparseable, fall back to heuristic
    if (result.dueAt && Number.isNaN(new Date(result.dueAt).getTime())) {
      const heur = parseDueAt(text, { now, timezone });
      result.dueAt = heur ? heur.toISOString() : null;
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(heuristicClassify(text, timezone));
  }
}
