"use client";

import { useRef, useState } from "react";
import type { ClassifyResult } from "@/lib/types";
import { createEntry, getTimezone } from "@/lib/client-store";

interface BatchItem {
  id: string;
  text: string;
  status: "pending" | "processing" | "done" | "error";
  result?: ClassifyResult;
}

async function classifyText(text: string): Promise<ClassifyResult> {
  const res = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, timezone: getTimezone() }),
  });
  return res.json() as Promise<ClassifyResult>;
}

export default function UploadPage() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addTexts(texts: string[]) {
    const clean = texts.map((t) => t.trim()).filter(Boolean);
    const newItems: BatchItem[] = clean.map((text) => ({
      id: crypto.randomUUID(),
      text,
      status: "pending",
    }));
    setItems((prev) => [...newItems, ...prev]);
  }

  async function readFile(file: File): Promise<string[]> {
    if (file.type === "text/plain" || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
      const text = await file.text();
      return text.split(/\n{2,}|\r\n{2,}/).filter((s) => s.trim().length > 10);
    }
    const text = await file.text().catch(() => `[Could not read: ${file.name}]`);
    return [text.slice(0, 2000)];
  }

  async function handleFiles(files: FileList | File[]) {
    const fileArr = Array.from(files);
    const allTexts: string[] = [];
    for (const file of fileArr) {
      const texts = await readFile(file);
      allTexts.push(...texts);
    }
    addTexts(allTexts);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  function handlePasteAdd() {
    const lines = pasteText.split(/\n{2,}|\n/).filter((s) => s.trim().length > 5);
    addTexts(lines);
    setPasteText("");
  }

  async function processAll() {
    const pending = items.filter((i) => i.status === "pending");
    if (!pending.length) return;
    setIsProcessing(true);

    for (const item of pending) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "processing" } : i));
      try {
        const result = await classifyText(item.text);
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "done", result } : i));

        await createEntry({
          type: result.type,
          raw: item.text,
          summary: result.summary,
          tags: result.tags,
          dueAt: result.dueAt,
          remindAt: result.dueAt,
          location: result.location,
          source: "upload",
        });
      } catch {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "error" } : i));
      }
    }
    setIsProcessing(false);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <main className="page-main">
      <div>
        <h1 className="page-title">Upload</h1>
        <p className="page-subtitle" style={{ marginTop: "0.4rem" }}>
          Drag in files or paste text in bulk. AI will classify each item and extract any dates.
        </p>
      </div>

      <div
        className={`drop-zone ${isDragOver ? "dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
      >
        <div className="drop-zone-icon">📂</div>
        <p>Drop .txt or .md files here</p>
        <p style={{ fontSize: "0.78rem", opacity: 0.6 }}>or click to browse</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.text"
          multiple
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
      </div>

      <div className="section-divider">or paste text</div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <textarea
          className="text-input"
          rows={5}
          placeholder="Paste notes, journal entries, or a list of tasks. Separate items with a blank line."
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button className="secondary" onClick={handlePasteAdd} disabled={!pasteText.trim()}>
            Add to queue
          </button>
          {pendingCount > 0 && (
            <button onClick={() => void processAll()} disabled={isProcessing}>
              {isProcessing ? "Processing…" : `Classify ${pendingCount} item${pendingCount !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="batch-results">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-soft)" }}>
              Queue — {items.length} item{items.length !== 1 ? "s" : ""}
            </h3>
            {!isProcessing && pendingCount > 0 && (
              <button onClick={() => void processAll()} style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}>
                Classify all
              </button>
            )}
          </div>

          {items.map((item) => (
            <div key={item.id} className={`entry-card ${item.result?.type ?? ""}`} style={{ position: "relative" }}>
              <div className="entry-header">
                <span className={`entry-badge ${item.result?.type ?? ""}`}>
                  {item.status === "pending" && "Pending"}
                  {item.status === "processing" && "⏳ Classifying…"}
                  {item.status === "done" && item.result?.type === "memory" && "📌 Memory"}
                  {item.status === "done" && item.result?.type === "action" && "✅ Action"}
                  {item.status === "error" && "❌ Error"}
                </span>
                <button
                  className="ghost"
                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                  onClick={() => removeItem(item.id)}
                >
                  ✕
                </button>
              </div>

              {item.result ? (
                <>
                  <p className="entry-summary">{item.result.summary}</p>
                  {item.result.dueAt && (
                    <p className="entry-meta">⏰ {new Date(item.result.dueAt).toLocaleString()}</p>
                  )}
                  <p className="entry-raw">{item.text.slice(0, 120)}{item.text.length > 120 ? "…" : ""}</p>
                  {item.result.tags.length > 0 && (
                    <div className="result-tags">
                      {item.result.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}
                    </div>
                  )}
                </>
              ) : (
                <p className="entry-raw">{item.text.slice(0, 160)}{item.text.length > 160 ? "…" : ""}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
