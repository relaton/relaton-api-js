// Server-side syntax highlighting for the record page's YAML and XML
// panes. Deterministic, dependency-free: escape first, then wrap tokens in
// spans. Colors come from CSS variables defined by the page chrome.

import { escapeHtml } from "../routes/ui/chrome";

export function highlightXml(source: string): string {
  const escaped = escapeHtml(source);
  return escaped
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-com">$1</span>')
    .replace(/(&lt;\?[\s\S]*?\?&gt;)/g, '<span class="tok-com">$1</span>')
    .replace(/(&lt;\/?)([\w.:-]+)/g, '$1<span class="tok-tag">$2</span>')
    .replace(/([\w.:-]+)(=)(&quot;[^&]*?&quot;)/g,
      '<span class="tok-attr">$1</span>$2<span class="tok-str">$3</span>');
}

export function highlightYaml(source: string): string {
  return source.split("\n").map((line) => {
    const commentMatch = line.match(/^(\s*)(#.*)$/);
    if (commentMatch && commentMatch[1] !== undefined && commentMatch[2] !== undefined) {
      return `${commentMatch[1]}<span class="tok-com">${escapeHtml(commentMatch[2])}</span>`;
    }
    const keyMatch = line.match(/^(\s*(?:- )?)([\w.$'-]+)(:)(.*)$/);
    if (!keyMatch || keyMatch[4] === undefined) return escapeHtml(line);
    const indent = keyMatch[1];
    const key = keyMatch[2];
    const colon = keyMatch[3];
    const rest = keyMatch[4];
    const value = rest.trim() === ""
      ? ""
      : `<span class="tok-val">${escapeHtml(rest ?? "").replace(/^(\s+)/, "$1")}</span>`;
    return `${indent}<span class="tok-key">${escapeHtml(key ?? "")}</span>${colon}${value}`;
  }).join("\n");
}
