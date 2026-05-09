export type EntryType = "memory" | "action";

export type EntrySource = "voice" | "text" | "upload" | "import";

export interface Entry {
  id: string;
  type: EntryType;
  raw: string;
  summary: string;
  tags: string[];
  done: boolean;
  /** ISO timestamp of when the action is due, e.g. "call mom tomorrow at 5pm". */
  dueAt: string | null;
  /** ISO timestamp of when to alert the user. Defaults to dueAt if not specified. */
  remindAt: string | null;
  /** ISO timestamp of when we last fired a notification for this entry. */
  notifiedAt: string | null;
  /** Optional location, parsed from input. */
  location: string | null;
  /** Where the entry came from. */
  source: EntrySource;
  createdAt: string;
}

export interface ClassifyResult {
  type: EntryType;
  summary: string;
  tags: string[];
  /** ISO datetime if a time was mentioned, else null. */
  dueAt: string | null;
  location: string | null;
}
