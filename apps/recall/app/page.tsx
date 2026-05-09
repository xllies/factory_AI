"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClassifyResult, Entry } from "@/lib/types";
import { createEntry, fetchEntries, getTimezone } from "@/lib/client-store";
import { ensureNotificationPermission, scheduleReminder } from "@/lib/reminders";
import { relativeLabel } from "@/lib/datetime";

type CaptureState = "idle" | "recording" | "processing" | "done" | "error";

interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: { length: number;[index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorLike { error: string }
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: SpeechRecognitionEventLike) => void;
  onend: () => void;
  onerror: (e: SpeechRecognitionErrorLike) => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export default function CapturePage() {
  const router = useRouter();
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [result, setResult] = useState<(ClassifyResult & { raw: string; entryId?: string }) | null>(null);
  const [recentEntries, setRecentEntries] = useState<Entry[]>([]);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");

  useEffect(() => {
    void (async () => {
      const fresh = await fetchEntries();
      setRecentEntries(fresh.slice(0, 5));
    })();

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!SpeechRec) {
      setTextMode(true);
      return;
    }
    setSpeechAvailable(true);

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e) => {
      const text = Array.from({ length: e.results.length })
        .map((_, i) => e.results[i][0].transcript)
        .join(" ");
      transcriptRef.current = text;
      setLiveTranscript(text);
    };

    rec.onend = () => {
      const captured = transcriptRef.current.trim();
      if (captured) {
        void runClassify(captured, "voice");
      } else {
        setCaptureState("idle");
      }
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech") {
        setCaptureState("idle");
        return;
      }
      setErrorMsg(`Microphone error: ${e.error}`);
      setCaptureState("error");
    };

    recognitionRef.current = rec;
    return () => rec.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(() => {
    if (!recognitionRef.current) return;
    transcriptRef.current = "";
    setLiveTranscript("");
    setResult(null);
    setErrorMsg("");
    setCaptureState("recording");
    recognitionRef.current.start();
  }, []);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  async function runClassify(text: string, source: "voice" | "text") {
    setCaptureState("processing");
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, timezone: getTimezone() }),
      });
      const data = (await res.json()) as ClassifyResult;

      const entry = await createEntry({
        type: data.type,
        raw: text,
        summary: data.summary,
        tags: data.tags ?? [],
        dueAt: data.dueAt ?? null,
        remindAt: data.dueAt ?? null,
        location: data.location ?? null,
        source,
      });

      setResult({ ...data, raw: text, entryId: entry.id });
      setCaptureState("done");
      setRecentEntries((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, 5));

      // If a reminder was extracted, ask for permission and arm it.
      if (entry.dueAt) {
        const perm = await ensureNotificationPermission();
        if (perm === "granted") scheduleReminder(entry);
      }
    } catch {
      setErrorMsg("Something went wrong. Try again.");
      setCaptureState("error");
    }
  }

  function reset() {
    setCaptureState("idle");
    setLiveTranscript("");
    transcriptRef.current = "";
    setResult(null);
    setTextInput("");
    setErrorMsg("");
  }

  function handlePointerDown() {
    if (captureState !== "idle") return;
    startRecording();
  }

  function handlePointerUp() {
    if (captureState !== "recording") return;
    stopRecording();
  }

  async function handleTextSubmit() {
    const text = textInput.trim();
    if (!text) return;
    await runClassify(text, "text");
  }

  const isProcessing = captureState === "processing";
  const isDone = captureState === "done";
  const isError = captureState === "error";
  const isRecording = captureState === "recording";

  return (
    <main className="capture-main">
      <div className="capture-center">
        {/* ── Voice mode ── */}
        {!textMode && (
          <div className="btn-area">
            {isRecording && (
              <>
                <div className="pulse-ring ring1" />
                <div className="pulse-ring ring2" />
              </>
            )}

            <button
              className={`capture-btn ${captureState}`}
              onPointerDown={captureState === "idle" ? handlePointerDown : undefined}
              onPointerUp={isRecording ? handlePointerUp : undefined}
              onPointerLeave={isRecording ? handlePointerUp : undefined}
              onClick={(isDone || isError) ? reset : undefined}
              disabled={isProcessing}
              aria-label={isRecording ? "Release to process" : "Hold to speak"}
            >
              {captureState === "idle" && <MicIcon />}
              {isRecording && <StopIcon />}
              {isProcessing && <SpinnerIcon />}
              {isDone && <CheckIcon />}
              {isError && <XIcon />}
            </button>

            <p className="btn-label">
              {captureState === "idle" && "Hold to speak"}
              {isRecording && "Listening…"}
              {isProcessing && "Classifying…"}
              {isDone && "Tap to capture again"}
              {isError && "Tap to try again"}
            </p>

            {captureState === "idle" && speechAvailable && (
              <button className="text-toggle" onClick={() => setTextMode(true)}>
                type instead
              </button>
            )}
          </div>
        )}

        {/* ── Text mode ── */}
        {textMode && captureState === "idle" && (
          <div className="text-capture">
            <textarea
              className="text-input"
              placeholder="Type a thought, memory, or task… try “remind me to call mom tomorrow at 5pm” (⌘↵ to save)"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={5}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  void handleTextSubmit();
                }
              }}
            />
            <div className="text-actions">
              <button onClick={() => void handleTextSubmit()} disabled={!textInput.trim()}>
                Save
              </button>
              {speechAvailable && (
                <button className="secondary" onClick={() => { setTextMode(false); setTextInput(""); }}>
                  Use mic
                </button>
              )}
            </div>
          </div>
        )}

        {/* Processing spinner for text mode */}
        {textMode && isProcessing && (
          <div className="btn-area">
            <SpinnerIcon large />
            <p className="btn-label">Classifying…</p>
          </div>
        )}

        {/* Reset link after text submit */}
        {textMode && (isDone || isError) && (
          <button className="text-toggle" style={{ marginTop: "0.5rem" }} onClick={reset}>
            ← capture again
          </button>
        )}

        {/* Live transcript */}
        {liveTranscript && isRecording && (
          <p className="live-transcript">{liveTranscript}</p>
        )}

        {/* Error message */}
        {errorMsg && <p className="error-msg">{errorMsg}</p>}

        {/* Result card */}
        {result && isDone && (
          <div className={`result-card ${result.type}`}>
            <div className="result-type">
              {result.type === "memory" ? "📌 Memory saved"
                : result.type === "shopping" ? "🛍️ Shopping request captured"
                : "✅ Action captured"}
            </div>
            <p className="result-summary">{result.summary}</p>

            {result.dueAt && (
              <p className="result-meta">
                ⏰ Due {relativeLabel(result.dueAt)} ·{" "}
                {new Date(result.dueAt).toLocaleString(undefined, {
                  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </p>
            )}
            {result.location && <p className="result-meta">📍 {result.location}</p>}

            {result.type === "shopping" && result.shopping && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
                {result.shopping.garmentClass && <span>👕 {result.shopping.garmentClass}</span>}
                {result.shopping.size && <span> · size {result.shopping.size}</span>}
                {result.shopping.color && <span> · {result.shopping.color}</span>}
                {result.shopping.budget && (
                  <span> · under {result.shopping.budget} {result.shopping.currency}</span>
                )}
              </div>
            )}

            {result.tags.length > 0 && (
              <div className="result-tags">
                {result.tags.map((tag) => (
                  <span key={tag} className="tag">#{tag}</span>
                ))}
              </div>
            )}

            {result.type === "shopping" && (
              <button
                className="result-cal-link"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", textDecoration: "underline" }}
                onClick={() => router.push(`/shopping?q=${encodeURIComponent(result.raw)}`)}
              >
                🔍 Find products now
              </button>
            )}

            {result.dueAt && result.entryId && result.type !== "shopping" && (
              <a
                className="result-cal-link"
                href={`/api/calendar/event/${result.entryId}.ics`}
              >
                📅 Add to calendar
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Recent entries ── */}
      {recentEntries.length > 0 && (
        <div className="recent">
          <div className="recent-header">
            <h3>Recent</h3>
            <Link href="/today" className="view-all">Today →</Link>
          </div>
          <div className="recent-list">
            {recentEntries.slice(0, 3).map((entry) => (
              <div key={entry.id} className={`recent-item ${entry.type}`}>
                <span className="recent-icon">
                  {entry.type === "memory" ? "📌" : entry.type === "shopping" ? "🛍️" : "✅"}
                </span>
                <span className="recent-summary">{entry.summary}</span>
                {entry.dueAt && (
                  <span className="recent-due">⏰ {relativeLabel(entry.dueAt)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function MicIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </svg>
  );
}

function SpinnerIcon({ large }: { large?: boolean }) {
  const s = large ? 64 : 38;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinner">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.15" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
