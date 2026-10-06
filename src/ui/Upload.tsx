import { useRef, useState } from "react";
import type { ParseIssue } from "../domain/parse";
import { EXPECTED_COLUMNS } from "../domain/schema";

interface UploadProps {
  onFile: (file: File) => void;
  busy: boolean;
  errors: ParseIssue[] | null;
  errorFile: string | null;
}

export function Upload({ onFile, busy, errors, errorFile }: UploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <main className="upload">
      <div className="upload-intro">
        <p className="eyebrow">Data · Context · Understanding</p>
        <h1>See what your wellness data says about your own routine.</h1>
        <p className="lede">
          Upload a CSV export and Rova lays out sleep, HRV, resting heart rate, training, temperature and sleeping
          respiration against your own history.
        </p>
      </div>

      <div
        className={`dropzone${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f && !busy) onFile(f);
        }}
      >
        {busy ? (
          <p className="dropzone-title" role="status"><span className="spinner" aria-hidden="true" /> Reading your file…</p>
        ) : (
          <>
            <p className="dropzone-title">Drop your CSV here</p>
            <p className="dropzone-sub">or</p>
            <button className="button primary" type="button" onClick={() => input.current?.click()}>Choose file</button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {errors && (
        <div className="error-panel" role="alert">
          <p className="error-title">{errorFile ? `“${errorFile}” couldn't be loaded` : "This file couldn't be loaded"}</p>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>
                {e.line !== undefined && <span className="error-where">Line {e.line}{e.column ? `, ${e.column}` : ""}</span>}
                {e.message}
              </li>
            ))}
          </ul>
          <p className="error-hint">Nothing was changed. Fix the file and upload it again.</p>
        </div>
      )}

      <details className="schema">
        <summary>Expected columns</summary>
        <code>{EXPECTED_COLUMNS.join(", ")}</code>
        <p>Dates as YYYY-MM-DD, one row per day. Empty cells are kept as missing readings, never treated as zero.</p>
      </details>
    </main>
  );
}
