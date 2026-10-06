import { useEffect, useRef, useState } from "react";
import type { MetricId } from "../domain/schema";
import { askAboutData } from "../intelligence/client";
import { MAX_QUESTION_CHARS } from "../intelligence/contract";
import { splitBasis } from "../intelligence/prompt";

interface AskProps {
  csv: string;
  fileName: string;
  metricId?: MetricId;
  /** e.g. "your HRV" or "your data" */
  subject: string;
  /** Static example questions, shown as one-tap starters. */
  questions: string[];
  /** What the answer can draw on, e.g. "the values in your file, Aug 1 – Aug 30". */
  scope: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; question: string }
  | { kind: "answer"; question: string; text: string; basis: string | null }
  | { kind: "error"; question: string; error: string };

/** Phase 1 AI surface: one question at a time, answered from the uploaded values only. */
export function Ask({ csv, fileName, metricId, subject, questions, scope }: AskProps) {
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

  async function ask(raw: string) {
    const q = raw.trim();
    if (!q || state.kind === "loading") return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setQuestion("");
    setState({ kind: "loading", question: q });
    try {
      const res = await askAboutData({ csv, fileName, question: q, metricId }, ctrl.signal);
      if (!res.ok && res.hide) { setUnavailable(true); return; }
      if (res.ok) setState({ kind: "answer", question: q, ...splitBasis(res.answer) });
      else setState({ kind: "error", question: q, error: res.error });
    } catch {
      /* aborted */
    }
  }

  if (unavailable) return null;
  const idSuffix = metricId ?? "all";

  return (
    <section className="ask" data-testid="ask" aria-labelledby={`ask-title-${idSuffix}`}>
      <h2 id={`ask-title-${idSuffix}`}>Ask about {subject}</h2>

      {state.kind !== "idle" && (
        <div className="ask-result" aria-live="polite">
          <p className="ask-q">{state.question}</p>
          {state.kind === "loading" && <p className="ask-wait"><span className="spinner" aria-hidden="true" /> Looking through your data…</p>}
          {state.kind === "answer" && (
            <>
              <p className="ask-a">{state.text}</p>
              {state.basis && <p className="ask-basis"><span>Based on</span> {state.basis}</p>}
            </>
          )}
          {state.kind === "error" && <p className="ask-error" role="alert">{state.error}</p>}
        </div>
      )}

      {state.kind === "idle" && (
        <div className="ask-starters">
          {questions.map((q) => (
            <button key={q} type="button" className="starter" onClick={() => ask(q)}>{q}</button>
          ))}
        </div>
      )}

      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <input
          id={`ask-input-${idSuffix}`}
          type="text"
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={state.kind === "idle" ? "Or ask your own question" : "Ask another question"}
          aria-label="Your question"
        />
        <button className="button primary" type="submit" disabled={!question.trim() || state.kind === "loading"}>Ask</button>
      </form>
      <p className="ask-note">Answers use only {scope}. AI can make mistakes, and Rova doesn't give medical advice.</p>
    </section>
  );
}
