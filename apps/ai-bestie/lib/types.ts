export type MessageRole = "user" | "assistant";

export type ChatMessage = {
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type MemoryItem = {
  id: string;
  content: string;
  category: "goal" | "feeling" | "fact" | "todo";
  createdAt: string;
};

export type CheckinPayload = {
  moodScore: number;
  note: string;
};
