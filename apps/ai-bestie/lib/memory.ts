import type { MemoryItem } from "@/lib/types";

export function memoryContext(items: MemoryItem[]): string {
  if (items.length === 0) {
    return "No memory captured yet.";
  }

  const latest = [...items]
    .slice(-8)
    .map((item) => `[${item.category}] ${item.content}`)
    .join("\n");

  return `Relevant user memory:\n${latest}`;
}

export function summarizeReply(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "I'm here with you. Want to share a little more?";
  return `I hear you. ${trimmed.slice(0, 280)}`;
}
