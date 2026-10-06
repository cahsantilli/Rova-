import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_FILE_BYTES } from "../src/domain/parse";
import type { IntelligenceStatus } from "../src/intelligence/contract";
import { handleAsk } from "./ask";
import { anthropicProvider, MODEL, type LlmProvider } from "./llm";

const PORT = Number(process.env.PORT ?? 8787);
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const SERVE_STATIC = process.env.NODE_ENV === "production";

const apiKey = process.env.ANTHROPIC_API_KEY;
const llm: LlmProvider | null = apiKey ? anthropicProvider(apiKey) : null;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_FILE_BYTES + 16_384) throw new Error("too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(pathname: string, res: ServerResponse) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, safe);
  if (!file.startsWith(DIST)) return json(res, 404, { error: "Not found" });
  try {
    if (!(await stat(file)).isFile()) throw new Error();
  } catch {
    file = join(DIST, "index.html"); // single-page app fallback
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    json(res, 404, { error: "Not found. Run `npm run build` first." });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/api/intelligence/status" && req.method === "GET") {
    const body: IntelligenceStatus = { available: llm !== null };
    return json(res, 200, body);
  }

  if (url.pathname === "/api/intelligence/ask" && req.method === "POST") {
    if (!llm) return json(res, 503, { ok: false, error: "Ask is not available on this server." });
    let body: unknown;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { ok: false, error: "The request couldn't be read." });
    }
    const result = await handleAsk(body, llm);
    return json(res, result.status, result.body);
  }

  if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "Not found" });
  if (SERVE_STATIC) return serveStatic(url.pathname, res);
  json(res, 404, { error: "In development, open the Vite server instead." });
});

server.listen(PORT, () => {
  console.log(`Rova server on http://localhost:${PORT}`);
  console.log(llm ? `Ask is on (model ${MODEL}).` : "Ask is off: set ANTHROPIC_API_KEY to enable it.");
});
