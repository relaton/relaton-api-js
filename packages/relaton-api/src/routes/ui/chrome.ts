// Shared UI chrome for api.relaton.org: sticky header nav, footer, and the
// full light/dark implementation (class strategy + persisted preference +
// system fallback, matching relaton.org and metanorma.org). Pages pass their
// own CSS and body markup; the chrome owns tokens, header, and footer.

export interface NavItem {
  text: string;
  href: string;
  id: string;
}

const NAV: NavItem[] = [
  { text: "Overview", href: "/", id: "overview" },
  { text: "Collections", href: "/collections", id: "collections" },
  { text: "Create record", href: "/create", id: "create" },
  { text: "Reference", href: "/docs", id: "reference" },
  { text: "GraphQL", href: "/graphql", id: "graphql" },
];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface LayoutOptions {
  title: string;
  body: string;
  css?: string;
  activeNav?: string;
}

const CORE_CSS = `
  :root {
    --bg: #ffffff; --bg-soft: #f8fafb; --bg-mute: #f1f4f7;
    --fg: #1C2126; --fg-2: #3D4854; --muted: #64748B; --border: #E2E8F0;
    --accent: #1F6CF1; --accent-soft: rgba(31, 108, 241, 0.1);
    --code-bg: #f6f8fa; --aqua: #008A64; --success: #059669;
    --font: 'Outfit', ui-sans-serif, system-ui, -apple-system, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .dark {
    --bg: #0B0F13; --bg-soft: #111820; --bg-mute: #171F28;
    --fg: #E8ECF0; --fg-2: #A0AEBE; --muted: #5F7082; --border: #1E2A36;
    --accent: #4D88F3; --accent-soft: rgba(31, 108, 241, 0.15);
    --code-bg: #10151b; --aqua: #21C197; --success: #34D399;
  }
  * { box-sizing: border-box; }
  html { color-scheme: light; }
  html.dark { color-scheme: dark; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.6 var(--font);
    -webkit-font-smoothing: antialiased;
  }
  code { font-family: var(--mono); font-size: 0.9em; }
  a { color: var(--accent); }
  main { max-width: 1088px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 6px; font-weight: 700; }
  h1 a { color: inherit; text-decoration: none; }
  .sub { color: var(--muted); margin: 0 0 28px; }
  .sub a { color: var(--accent); }
  .meta { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
  .meta a { color: var(--accent); }
  pre {
    background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.5;
    font-family: var(--mono);
    white-space: pre-wrap; word-break: break-word;
  }

  .site-header {
    position: sticky; top: 0; z-index: 40;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border-bottom: 1px solid var(--border);
  }
  .site-header nav {
    max-width: 1088px; margin: 0 auto; padding: 0 24px;
    height: 55px; display: flex; align-items: center; gap: 16px;
  }
  .brand {
    display: flex; align-items: center; gap: 8px; text-decoration: none;
    color: var(--fg); font-weight: 700; font-size: 17px; letter-spacing: -0.02em;
    flex-shrink: 0;
  }
  .brand:hover { color: var(--accent); }
  .nav-links { display: flex; align-items: center; gap: 2px; flex: 1; }
  .nav-link {
    display: inline-flex; padding: 8px 11px; font-size: 14px; font-weight: 500;
    color: var(--fg-2); text-decoration: none; border-radius: 8px;
    transition: color 0.15s, background 0.15s;
  }
  .nav-link:hover { color: var(--fg); background: var(--bg-mute); }
  .nav-link[aria-current="page"] { color: var(--accent); background: var(--accent-soft); }
  .nav-external { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .nav-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; padding: 0; border: none; background: none;
    border-radius: 8px; color: var(--fg-2); cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .nav-icon:hover { color: var(--accent); background: var(--bg-mute); }
  .theme-toggle .icon-sun { display: none; }
  html.dark .theme-toggle .icon-sun { display: block; }
  html.dark .theme-toggle .icon-moon { display: none; }
  .nav-burger { display: none; }
  @media (max-width: 960px) {
    .nav-links {
      display: none; position: absolute; top: 55px; left: 0; right: 0;
      flex-direction: column; align-items: stretch; padding: 10px 24px 14px;
      background: var(--bg); border-bottom: 1px solid var(--border);
      box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    }
    .nav-links.open { display: flex; }
    .nav-burger { display: inline-flex; margin-left: auto; }
    .nav-external { margin-left: 0; }
  }

  footer {
    margin-top: 48px; color: var(--muted); font-size: 13px;
    border-top: 1px solid var(--border); padding-top: 16px;
  }
  footer a { color: var(--accent); }
`;

const BRAND_SVG = `<svg width="24" height="24" viewBox="0 0 351.24 351.66" fill="none" aria-hidden="true">
      <path d="M276.31,242.07c-4.44,2.78-8.88,5.54-13.31,8.32c-24.96,15.62-49.91,31.25-74.9,46.83c-1.09,0.68-1.35,1.28-1.16,2.53c2.26,15.33-2.14,28.54-13.12,39.42c-7.38,7.31-16.42,11.41-26.79,12.32c-23.06,2.02-43.31-12.81-48.04-35.45c-2.97-14.23,0.47-27.08,9.77-38.3c0.63-0.76,0.68-1.2,0.16-2.03c-18.27-29.23-36.52-58.47-54.74-87.73c-0.45-0.72-0.9-0.94-1.73-0.8c-23.2,4.18-46.18-10.87-51.44-34.68c-5.32-24.06,10.58-48.68,34.73-53.38c14.55-2.83,27.47,0.68,38.74,10.3c0.09,0.08,0.19,0.14,0.4,0.3c0.32-0.2,0.69-0.41,1.05-0.64c29.19-18.27,58.38-36.55,87.58-54.81c0.71-0.45,0.96-0.87,0.81-1.72c-4.21-23.05,10.72-45.91,33.47-51.3c25.01-5.92,49.57,9.64,54.55,34.86c2.76,13.98-0.61,26.61-9.66,37.68c-0.33,0.4-0.67,0.79-1.03,1.22c3.53,5.65,7.04,11.27,10.54,16.89c14.9,23.89,29.8,47.78,44.69,71.69c0.5,0.8,0.96,1.17,1.98,0.98c21.29-3.76,42.25,8.46,49.67,28.91c9.37,25.82-6.6,54.21-33.54,59.31c-14.16,2.68-26.86-0.8-37.92-10.08C276.84,242.51,276.6,242.31,276.31,242.07z" fill="currentColor" opacity="0.9"/>
    </svg>`;

export function layout({ title, body, css, activeNav }: LayoutOptions): string {
  const navLinks = NAV.map((item) => {
    const current = item.id === activeNav ? ' aria-current="page"' : "";
    return `<a class="nav-link" href="${item.href}"${current}>${escapeHtml(item.text)}</a>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/svg+xml" href="https://relaton.org/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<meta name="theme-color" content="#1F6CF1">
<script>
(function () {
  try {
    var s = localStorage.getItem("relaton-theme");
    var d = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (s === "dark" || (s !== "light" && d)) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
</script>
<style>${CORE_CSS}${css ?? ""}</style>
</head>
<body>
<header class="site-header">
<nav>
  <a class="brand" href="/" title="Relaton API">
    ${BRAND_SVG}
    Relaton API
  </a>
  <button class="nav-icon nav-burger" aria-label="Toggle navigation" aria-expanded="false" data-nav-burger>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>
  <div class="nav-links" data-nav-menu>
    ${navLinks}
  </div>
  <div class="nav-external">
    <a class="nav-icon" href="https://relaton.org/" aria-label="relaton.org" title="relaton.org">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    </a>
    <a class="nav-icon" href="https://github.com/relaton" rel="noopener" aria-label="GitHub" title="GitHub">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.164 6.839 9.49.5.09.682-.218.682-.484 0-.236-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .269.18.579.688.481C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
    </a>
    <button class="nav-icon theme-toggle" aria-label="Toggle dark mode" data-theme-toggle title="Toggle light/dark (follows your system until you choose)">
      <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
  </div>
</nav>
</header>
<main>
${body}
<footer><a href="https://relaton.org/">Relaton</a> — bibliographic data for technical standards ·
<a href="/docs">API reference</a> ·
<a href="https://github.com/relaton" rel="noopener">source &amp; issues</a> ·
an open source project by <a href="https://www.ribose.com" rel="noopener">Ribose</a></footer>
</main>
<script>
(function () {
  var toggle = document.querySelector("[data-theme-toggle]");
  toggle.addEventListener("click", function () {
    var dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("relaton-theme", dark ? "dark" : "light"); } catch (e) {}
  });
  var burger = document.querySelector("[data-nav-burger]");
  var menu = document.querySelector("[data-nav-menu]");
  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });
  }
})();
</script>
</body>
</html>`;
}
