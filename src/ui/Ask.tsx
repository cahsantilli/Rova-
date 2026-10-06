import { useEffect, useRef, useState } from "react";
import type { MetricId } from "../domain/schema";
import { askAboutData } from "../intelligence/client";
import { MAX_QUESTION_CHARS } from "../intelligence/contract";

interface AskProps {
  csv: string;
  fileName: string;
  metricId?: MetricId;
  metricName?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; question: string }
  | { kind: "answer"; question: string; answer: string }
  | { kind: "error"; question: string; error: string };

/** "HRV" stays as is; "Resting Heart Rate" reads as "resting heart rate" mid-sentence. */
const inSentence = (name: string) => (name === name.toUpperCase() ? name : name.toLowerCase());

/** Phase 1 AI surface: one question, answered from the uploaded values only. */
export function Ask({ csv, fileName, metricId, metricName }: AskProps) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [unavailable, setUnavailable] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // A new metric is a new context; drop the previous exchange.
  useEffect(() => {
    abort.current?.abort();
    setState({ kind: "idle" });
    setQuestion("");
  }, [metricId, csv]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || state.kind === "loading") return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ kind: "loading", question: q });
    try {
      const res = await askAboutData({ csv, fileName, question: q, metricId }, ctrl.signal);
      if (!res.ok && res.hide) { setUnavailable(true); return; }
      setState(res.ok ? { kind: "answer", question: q, answer: res.answer } : { kind: "error", question: q, error: res.error });
      if (res.ok) setQuestion("");
    } catch {
      /* aborted */
    }
  }

  if (unavailable) return null;

  return (
    <div className="ask" data-testid="ask">
      <div className="ask-head">
        <h3>Ask about {metricName ? `your ${inSentence(metricName)} data` : "your data"}</h3>
        <p className="muted small">Answered by an AI model that reads only the values in your file. It describes your data; it doesn't give medical advice.</p>
      </div>
      <form onSubmit={submit} className="ask-form">
        <input
          type="text"
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={metricName ? `e.g. Which days had my lowest ${inSentence(metricName)}?` : "e.g. What changed in the week of Aug 16?"}
          aria-label="Your question"
        />
        <button className="button primary" type="submit" disabled={!question.trim() || state.kind === "loading"}>
          {state.kind === "loading" ? "Asking…" : "Ask"}
        </button>
      </form>
      {state.kind !== "idle" && (
        <div className="ask-result" aria-live="polite">
          <p className="ask-q">{state.question}</p>
          {state.kind === "loading" && <p className="muted"><span className="spinner" aria-hidden="true" /> Reading your data…</p>}
          {state.kind === "answer" && <p className="ask-a">{state.answer}</p>}
          {state.kind === "error" && <p className="ask-error" role="alert">{state.error}</p>}
        </div>
      )}
    </div>
  );
}
