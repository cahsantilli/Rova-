import { useCallback, useEffect, useState } from "react";
import { MAX_FILE_BYTES, parseWellnessCsv, type Dataset, type ParseIssue } from "./domain/parse";
import { metricById, type MetricId } from "./domain/schema";
import { inSentence } from "./domain/summary";
import { rangeLabel } from "./domain/format";
import { fetchIntelligenceStatus } from "./intelligence/client";
import { Upload } from "./ui/Upload";
import { Overview } from "./ui/Overview";
import { MetricView } from "./ui/MetricView";
import { Ask } from "./ui/Ask";

interface Loaded {
  ds: Dataset;
  csv: string;
}

const STORE_KEY = "rova.csv";

function readRoute(): MetricId | null {
  const id = window.location.hash.replace(/^#\/?/, "");  // "#hrv" (also accepts the older "#/hrv")
  return metricById(id)?.id ?? null;
}

function restore(): Loaded | null {
  try {
    const saved = sessionStorage.getItem(STORE_KEY);
    if (!saved) return null;
    const { csv, fileName } = JSON.parse(saved) as { csv: string; fileName: string };
    const r = parseWellnessCsv(csv, fileName);
    return r.ok ? { ds: r.dataset, csv } : null;
  } catch {
    return null;
  }
}

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(restore);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ParseIssue[] | null>(null);
  const [errorFile, setErrorFile] = useState<string | null>(null);
  const [route, setRoute] = useState<MetricId | null>(readRoute);
  const [askAvailable, setAskAvailable] = useState(false);

  useEffect(() => {
    const onHash = () => { setRoute(readRoute()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", onHash);
    fetchIntelligenceStatus().then((s) => setAskAvailable(s.available));
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((id: MetricId | null) => {
    window.location.hash = id ?? "overview";
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setErrors(null);
    setErrorFile(file.name);
    try {
      if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
        setErrors([{ message: "Rova reads .csv files. Export your data as CSV and try again." }]);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setErrors([{ message: `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB; Rova accepts files up to ${MAX_FILE_BYTES / 1024 / 1024} MB.` }]);
        return;
      }
      const text = await file.text();
      const result = parseWellnessCsv(text, file.name);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ csv: text, fileName: file.name })); } catch { /* storage is optional */ }
      setLoaded({ ds: result.dataset, csv: text });
      go(null);
    } catch {
      setErrors([{ message: "The file couldn't be read. Make sure it's a plain-text CSV." }]);
    } finally {
      setBusy(false);
    }
  }, [go]);

  const reset = () => {
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    setLoaded(null);
    setErrors(null);
    go(null);
  };

  if (!loaded) {
    return (
      <div className="app">
        <TopBar />
        <Upload onFile={handleFile} busy={busy} errors={errors} errorFile={errorFile} />
      </div>
    );
  }

  const { ds, csv } = loaded;
  const metric = route ? metricById(route) : undefined;

  const range = rangeLabel(ds.firstDate, ds.lastDate);

  return (
    <div className="app">
      <TopBar>
        <span className="file-meta" title={ds.fileName}>{range}</span>
        <button className="button ghost small-button" onClick={reset}>Upload another file</button>
      </TopBar>

      <main className="page">
        {metric ? (
          <MetricView
            key={metric.id}
            ds={ds}
            metric={metric}
            ask={askAvailable ? (
              <Ask csv={csv} fileName={ds.fileName} metricId={metric.id} subject={`your ${inSentence(metric.name)}`} questions={metric.questions} scope={`the values in your file, ${range}`} />
            ) : undefined}
          />
        ) : (
          <Overview
            ds={ds}
            ask={askAvailable ? (
              <Ask csv={csv} fileName={ds.fileName} subject="your data" questions={["How was this week compared with the rest of the month?", "Which days stood out the most?"]} scope={`the values in your file, ${range}`} />
            ) : undefined}
          />
        )}
      </main>
    </div>
  );
}

function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <a className="wordmark" href="#overview">Rova</a>
      <div className="topbar-right">{children}</div>
    </header>
  );
}
