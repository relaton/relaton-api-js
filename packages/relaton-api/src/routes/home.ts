import type { AppEnv } from "../env";
import { layout, escapeHtml } from "./ui/chrome";

interface FlavorRow {
  flavor: string;
  doc_count: number;
  ingested_at: string;
}

const CSS = `
  main { max-width: 880px; }
  .tagline { color: var(--muted); font-size: 18px; margin: 0 0 20px; }
  .stats { color: var(--muted); font-size: 14px; margin: 0 0 40px; }
  .stats b { color: var(--fg); }
  h2 { font-size: 20px; margin: 40px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .card { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .card a { color: var(--accent); text-decoration: none; font-family: var(--mono); font-weight: 600; }
  .card a:hover { text-decoration: underline; }
  .card p { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
  .search { display: flex; gap: 8px; margin: 12px 0; }
  .search input {
    flex: 1; padding: 10px 12px; font-size: 15px; font-family: var(--mono);
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg);
  }
  .search button {
    padding: 10px 18px; font-size: 15px; border: none; border-radius: 8px;
    background: var(--accent); color: #fff; cursor: pointer;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    display: inline-flex; align-items: baseline; gap: 6px; background: var(--bg-mute);
    border: 1px solid var(--border); border-radius: 999px; padding: 3px 12px; font-size: 13px;
  }
  .chip-count { color: var(--muted); }
  #result { display: none; margin-top: 8px; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow: auto; }
  #status { color: var(--muted); font-size: 13px; margin-top: 6px; min-height: 1em; }
`;

export async function renderHome(db: D1Database, version: string, name = "Relaton API"): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT d.flavor, COUNT(*) AS doc_count, MAX(f.ingested_at) AS ingested_at
       FROM documents AS d LEFT JOIN flavors AS f ON f.flavor = d.flavor
       GROUP BY d.flavor ORDER BY doc_count DESC`,
    )
    .all<FlavorRow>();
  const flavors = results ?? [];
  const total = flavors.reduce((n, f) => n + f.doc_count, 0);
  const lastIngest = flavors
    .map((f) => f.ingested_at)
    .sort()
    .pop();

  const chips = flavors
    .map(
      (f) =>
        `<span class="chip"><span class="chip-name">${escapeHtml(f.flavor)}</span><span class="chip-count">${f.doc_count.toLocaleString("en-US")}</span></span>`,
    )
    .join("");

  const body = `
  <h1>${escapeHtml(name)}</h1>
  <p class="tagline">Bibliographic data for technical standards, aggregated across the
  <a href="https://github.com/relaton" rel="noopener">relaton-data-*</a> repositories. Read-only, no authentication.</p>
  <p class="stats"><b>${flavors.length} flavors</b> · <b>${total.toLocaleString("en-US")} documents</b> indexed${lastIngest ? ` · last ingest ${escapeHtml(lastIngest.slice(0, 10))}` : ""} · release ${escapeHtml(version)}</p>
  <form class="search" method="get" action="/search" style="margin:0 0 28px">
    <input name="q" placeholder="Search every collection — identifier or title…" aria-label="Search the database">
    <button type="submit">Search</button>
  </form>

  <h2>Endpoints</h2>
  <div class="grid">
    <div class="card">
      <a href="/collections">/collections — browse the database</a>
      <p>Every flavor as a browsable collection: records, search, and per-document pages with YAML, XML, and AsciiBib tabs.</p>
    </div>
    <div class="card">
      <a href="/create">/create — build a record</a>
      <p>Fill in a form and get Relaton YAML, XML, JSON, and AsciiBib to copy — the AsciiBib output pastes straight into Metanorma.</p>
    </div>
    <div class="card">
      <a href="/api/v1/document?code=ISO%2019115-1">GET /api/v1/document</a>
      <p>Fetch a document as Relaton XML. Parameters: <code>code</code> (required), <code>year</code>, <code>all_parts</code>, <code>keep_year</code>. Same contract the Relaton gem uses via <code>use_api</code>.</p>
    </div>
    <div class="card">
      <a href="/api/v1/version">GET /api/v1/version</a>
      <p>API and data versions. <code>?format=xml|json</code> for machine-readable output.</p>
    </div>
    <div class="card">
      <a href="/docs">GET /docs</a>
      <p>Interactive OpenAPI 3.1 reference (spec at <a href="/openapi.json">/openapi.json</a>).</p>
    </div>
    <div class="card">
      <a href="/graphql">POST /graphql</a>
      <p>Query across <em>all</em> flavors: <code>document(code)</code>, <code>documents(code, flavor, title, year, doctype, first, after)</code>, <code>flavors</code>. GraphiQL playground at this URL.</p>
    </div>
  </div>

  <h2>Try it</h2>
  <div class="search">
    <input id="code" placeholder='e.g. ISO 19115-1, RFC-style: IEC 31010:2019, ГОСТ Р 1.0-2015, 3GPP TS 23.040' aria-label="Document code">
    <button onclick="lookup()">Fetch</button>
  </div>
  <div id="status"></div>
  <pre id="result"><code id="result-code"></code></pre>

  <h2>Examples</h2>
  <pre><code># Latest edition of a standard
curl "https://api.relaton.org/api/v1/document?code=ISO%2019115-1"

# Specific year and scope wrapper (gem-style)
curl "https://api.relaton.org/api/v1/document?code=ISO(ISO%2019115-1)&amp;year=2014"

# Search every flavor by title, via GraphQL
curl -s https://api.relaton.org/graphql \\
  -H 'Content-Type: application/json' \\
  -d '{"query":"{ documents(title: \\"risk management\\", first: 5) { edges { node { docid flavor year title } } } }"}'</code></pre>

  <h2>Coverage</h2>
  <div class="chips">${chips}</div>

  <script>
  async function lookup() {
    var code = document.getElementById('code').value.trim();
    var status = document.getElementById('status');
    var result = document.getElementById('result');
    var resultCode = document.getElementById('result-code');
    status.textContent = '';
    result.style.display = 'none';
    if (!code) return;
    status.textContent = 'Fetching…';
    try {
      var res = await fetch('/api/v1/document?code=' + encodeURIComponent(code));
      var text = await res.text();
      if (res.ok) {
        resultCode.textContent = formatXml(text);
        status.textContent = res.status + ' ' + res.statusText;
      } else {
        resultCode.textContent = text;
        status.textContent = 'Not found — try one of the examples above.';
      }
      result.style.display = 'block';
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
    }
  }
  function formatXml(xml) {
    var formatted = '', indent = '';
    xml.split(/>\\s*</).forEach(function (node) {
      if (node.length) {
        formatted += indent + '<' + node + '>\\n';
        if (/^\\//.test(node)) indent = indent.slice(2);
        else if (!/\\/$/.test(node) && !/^\\?xml/.test(node) && /^\\w/.test(node)) indent += '  ';
      }
    });
    return formatted.replace(/<\\?\\s/, '<?').slice(0, -2);
  }
  document.getElementById('code').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') lookup();
  });
  </script>`;

  return layout({ title: "Relaton API", body, css: CSS, activeNav: "overview" });
}
