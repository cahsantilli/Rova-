// Packs the built app (dist/) into one self-contained HTML page for publishing as a claude.ai Artifact.
// Usage: npm run build && node scripts/build-artifact.mjs  → artifact/rova.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");
const js = html.match(/<script[^>]+src="\/?(assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/<link[^>]+href="\/?(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error("Couldn't find built assets in dist/index.html. Run `npm run build` first.");

const script = readFileSync(new URL(js, dist), "utf8").replace(/<\/script/gi, "<\\/script");
const style = readFileSync(new URL(css, dist), "utf8").replace(/<\/style/gi, "<\\/style");

// The Artifact host adds the doctype/head/body skeleton; the page supplies title, style and content.
const page = `<title>Rova</title>
<style>${style}</style>
<div id="root"></div>
<script type="module">${script}</script>
`;
mkdirSync(new URL("../artifact/", import.meta.url), { recursive: true });
writeFileSync(new URL("../artifact/rova.html", import.meta.url), page);
console.log(`artifact/rova.html (${(page.length / 1024).toFixed(0)} KB)`);
