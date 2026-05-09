"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ChatMessage, MemoryItem } from "@/lib/types";

const PROFILE_KEY = "ai-bestie-profile-id";
const STARTER_PROMPTS = [
  "What's one thing that felt heavy today?",
  "What's one tiny win from this week?",
  "What do you want tomorrow's version of you to remember?",
];

function createProfileId() {
  return `demo-${crypto.randomUUID()}`;
}

export default function HomePage() {
  const [profileId, setProfileId] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [memoryInput, setMemoryInput] = useState("");
  const [checkinNote, setCheckinNote] = useState("");
  const [moodScore, setMoodScore] = useState(3);
  const [loadingChat, setLoadingChat] = useState(false);
  const [status, setStatus] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);

  useEffect(() => {
    const fromStorage = window.localStorage.getItem(PROFILE_KEY);
    if (fromStorage) {
      setProfileId(fromStorage);
      return;
    }
    const nextId = createProfileId();
    window.localStorage.setItem(PROFILE_KEY, nextId);
    setProfileId(nextId);
  }, []);

  const prompt = useMemo(() => STARTER_PROMPTS[moodScore % STARTER_PROMPTS.length], [moodScore]);

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    setLoadingChat(true);
    setStatus("");
    const nextUser: ChatMessage = { role: "user", content: text, createdAt: new Date().toISOString() };
    setChat((prev) => [...prev, nextUser]);
    setChatInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, memories: memoryItems }),
      });
      const data = (await response.json()) as { reply?: string; warning?: string };
      const aiReply = data.reply ?? "I am here with you.";
      setChat((prev) => [...prev, { role: "assistant", content: aiReply, createdAt: new Date().toISOString() }]);
      if (data.warning) setStatus(data.warning);
    } catch {
      setStatus("Chat request failed.");
    } finally {
      setLoadingChat(false);
    }
  }

  async function saveMemory() {
    const content = memoryInput.trim();
    if (!content || !profileId) return;

    const localItem: MemoryItem = {
      id: crypto.randomUUID(),
      content,
      category: "fact",
      createdAt: new Date().toISOString(),
    };

    setMemoryItems((prev) => [...prev, localItem]);
    setMemoryInput("");

    const response = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        content,
        category: "fact",
      }),
    });
    const data = (await response.json()) as { stored?: boolean; reason?: string };
    if (!data.stored) {
      setStatus(data.reason ?? "Memory saved locally only.");
    } else {
      setStatus("Memory saved.");
    }
  }

  async function saveProfile() {
    if (!profileId) return;
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, fullName: name, focusGoal: goal }),
    });
    const data = (await response.json()) as { stored?: boolean; reason?: string; error?: string };

    if (data.error) {
      setStatus(data.error);
      return;
    }
    if (!data.stored) {
      setStatus(data.reason ?? "Profile saved locally only.");
      return;
    }
    setStatus("Profile saved.");
  }

  async function submitCheckin(e: FormEvent) {
    e.preventDefault();
    const note = checkinNote.trim();
    if (!note || !profileId) return;

    const response = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, moodScore, note }),
    });
    const data = (await response.json()) as { stored?: boolean; reason?: string; error?: string };

    if (data.error) {
      setStatus(data.error);
      return;
    }

    if (!data.stored) {
      setStatus(data.reason ?? "Check-in tracked only in session.");
    } else {
      setStatus("Check-in saved.");
    }
    setCheckinNote("");
  }

  return (
    <main className="stack">
      <section className="panel stack">
        <h1>AI Bestie MVP</h1>
        <p>Memory-first companion app baseline for young professionals. Native clients can consume this API-first foundation.</p>
        <p className="muted">Profile ID: {profileId || "initializing..."}</p>
      </section>

      <section className="panel stack">
        <h2>Onboarding Snapshot</h2>
        <div className="row">
          <input placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            placeholder="Current focus goal (e.g. stop doomscrolling)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>
        <div className="row">
          <button className="secondary" onClick={saveProfile}>
            Save onboarding profile
          </button>
        </div>
        <p className="muted">Auth-linked profile ownership will be finalized once mobile auth screens are wired.</p>
      </section>

      <section className="panel stack">
        <h2>Daily Check-in</h2>
        <p>{prompt}</p>
        <form className="stack" onSubmit={submitCheckin}>
          <select value={moodScore} onChange={(e) => setMoodScore(Number(e.target.value))}>
            <option value={1}>1 - Rough</option>
            <option value={2}>2 - Low</option>
            <option value={3}>3 - Neutral</option>
            <option value={4}>4 - Good</option>
            <option value={5}>5 - Great</option>
          </select>
          <textarea
            value={checkinNote}
            onChange={(e) => setCheckinNote(e.target.value)}
            rows={3}
            placeholder="How are you feeling right now?"
          />
          <button type="submit">Save check-in</button>
        </form>
      </section>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Memory Capture</h2>
          <p className="muted">{memoryItems.length} saved thoughts</p>
        </div>
        <div className="row">
          <textarea
            value={memoryInput}
            onChange={(e) => setMemoryInput(e.target.value)}
            rows={2}
            placeholder="Add something future-you should remember."
          />
          <button onClick={saveMemory}>Save memory</button>
        </div>
      </section>

      <section className="panel stack">
        <h2>Chat with AI Bestie</h2>
        <div className="chat-log">
          {chat.length === 0 ? <p className="muted">Start a conversation.</p> : null}
          {chat.map((entry, index) => (
            <div key={`${entry.createdAt}-${index}`} className={`bubble ${entry.role === "user" ? "user" : "ai"}`}>
              {entry.content}
            </div>
          ))}
        </div>
        <form className="stack" onSubmit={sendChat}>
          <textarea
            rows={3}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Talk to your AI bestie..."
          />
          <button type="submit" disabled={loadingChat}>
            {loadingChat ? "Thinking..." : "Send"}
          </button>
        </form>
      </section>

      {status ? (
        <section className="panel">
          <p>{status}</p>
        </section>
      ) : null}
    </main>
  );
}
