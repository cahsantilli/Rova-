import { useCallback, useEffect, useState } from "react";
import { MAX_FILE_BYTES, parseWellnessCsv, type Dataset, type ParseIssue } from "./domain/parse";
import { METRICS, metricById, type MetricId } from "./domain/schema";
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
  const id = window.location.hash.replace(/^#\/?/, "");
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
    window.location.hash = id ? `/${id}` : "/";
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

  return (
    <div className="app">
      <TopBar>
        <div className="file-meta">
          <span className="file-name" title={ds.fileName}>{ds.fileName}</span>
          <span className="muted small">{rangeLabel(ds.firstDate, ds.lastDate)}</span>
        </div>
        <button className="button ghost" onClick={reset}>Upload another file</button>
      </TopBar>

      <div className="layout">
        <nav className="nav" aria-label="Metrics">
          <a href="#/" className={!metric ? "is-active" : undefined} aria-current={!metric ? "page" : undefined}>Overview</a>
          {METRICS.map((m) => (
            <a key={m.id} href={`#/${m.id}`} className={metric?.id === m.id ? "is-active" : undefined} aria-current={metric?.id === m.id ? "page" : undefined}>
              {m.name}
            </a>
          ))}
        </nav>

        <main className="content">
          {metric ? (
            <MetricView
              key={metric.id}
              ds={ds}
              metric={metric}
              aside={askAvailable ? <Ask csv={csv} fileName={ds.fileName} metricId={metric.id} metricName={metric.name} /> : undefined}
            />
          ) : (
            <>
              <Overview ds={ds} onOpen={go} />
              {askAvailable && <Ask csv={csv} fileName={ds.fileName} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <a className="wordmark" href="#/">Rova</a>
      <div className="topbar-right">{children}</div>
    </header>
  );
}
