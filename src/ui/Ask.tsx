import { useEffect, useRef, useState } from "react";
import type { MetricId } from "../domain/schema";
import { askAboutData } from "../intelligence/client";
import { MAX_QUESTION_CHARS, type RovaAnswer } from "../intelligence/contract";

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
  | { kind: "answer"; question: string; answer: RovaAnswer }
  | { kind: "error"; question: string; error: string };

/** One question at a time. Answers keep your data, general knowledge and interpretation visibly apart. */
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
      if (res.ok) setState({ kind: "answer", question: q, answer: res.answer });
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
          {state.kind === "answer" && <AnswerView a={state.answer} />}
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
      <p className="ask-note">Answers use {scope} and Rova's own short library of general wellness notes. AI can make mistakes, and Rova doesn't give medical advice.</p>
    </section>
  );
}

function AnswerView({ a }: { a: RovaAnswer }) {
  return (
    <div className="answer" data-testid="ask-answer">
      {a.summary && <p className="ask-a">{a.summary}</p>}
      {a.boundary && <p className="ask-boundary" data-testid="ask-boundary">{a.boundary}</p>}

      {a.observed.length > 0 && (
        <section className="ask-part" data-part="data">
          <h3>From your data</h3>
          <ul>
            {a.observed.map((o, i) => (
              <li key={i}>{o.text}{o.period && <span className="ask-period">{o.period}</span>}</li>
            ))}
          </ul>
        </section>
      )}

      {a.insufficientData.length > 0 && (
        <section className="ask-part" data-part="gaps">
          <h3>Not in your data</h3>
          <ul>{a.insufficientData.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      )}

      {a.knowledge.length > 0 && (
        <section className="ask-part" data-part="knowledge">
          <h3>General knowledge</h3>
          <ul>
            {a.knowledge.map((k) => (
              <li key={k.id}>
                {k.text}
                <span className="ask-source">
                  {k.source ? <a href={k.source.url} target="_blank" rel="noopener noreferrer">{k.source.name}</a> : "Rova editorial"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.interpretation.length > 0 && (
        <section className="ask-part" data-part="interpretation">
          <h3>What this might mean</h3>
          <ul>{a.interpretation.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <p className="ask-caveat">A possible reading, not a finding. Days that move together don't show what caused what.</p>
        </section>
      )}

      {a.basis && <p className="ask-basis"><span>Based on</span> {a.basis}</p>}
    </div>
  );
}
