// scripts/screenshot-map/render.js
const CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.45 system-ui, sans-serif; background: #0f1115; color: #e7e9ee; }
  header { padding: 20px 24px; border-bottom: 1px solid #262a33; position: sticky; top: 0; background: #0f1115; }
  header h1 { margin: 0 0 4px; font-size: 18px; }
  header p { margin: 0; color: #9aa1ad; }
  section { padding: 16px 24px 8px; }
  section > h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: #9aa1ad; margin: 24px 0 12px; }
  .lanes { display: flex; gap: 16px; overflow-x: auto; align-items: flex-start; padding-bottom: 12px; }
  .lane { min-width: 260px; background: #161922; border: 1px solid #262a33; border-radius: 12px; padding: 12px; }
  .lane > h3 { margin: 0 0 10px; font-size: 13px; color: #c7ccd6; }
  .card { background: #1b1f2a; border: 1px solid #2b3040; border-radius: 10px; overflow: hidden; margin-bottom: 12px; }
  .card img { display: block; width: 100%; height: 150px; object-fit: cover; object-position: top; background: #0c0e12; }
  .card .noimg { height: 150px; display: flex; align-items: center; justify-content: center; color: #6b7280; background: #0c0e12; }
  .card .meta { padding: 8px 10px; }
  .card .title { font-size: 12px; word-break: break-all; color: #e7e9ee; }
  .card .row { display: flex; gap: 6px; margin-top: 6px; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: #2b3040; color: #c7ccd6; }
  .pill { font-size: 10px; padding: 1px 6px; border-radius: 999px; }
  .pill.ok { background: #16331f; color: #4ade80; }
  .pill.error { background: #3a1620; color: #f87171; }
  .pill.skipped { background: #33301a; color: #fbbf24; }
  .note { font-size: 11px; color: #9aa1ad; margin-top: 4px; }
  .card.status-error { border-color: #5b2330; }
  .card.status-skipped { border-color: #5b531f; }
`;

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function dataUri(png) {
  if (!png) return null;
  return "data:image/png;base64," + Buffer.from(png).toString("base64");
}

function summarize(results) {
  const s = { ok: 0, error: 0, skipped: 0 };
  for (const r of results) s[r.status] = (s[r.status] || 0) + 1;
  return s;
}

function card(r) {
  const img = dataUri(r.png);
  const thumb = img
    ? `<img src="${escapeHtml(img)}" loading="lazy" alt="">`
    : `<div class="noimg">${escapeHtml(r.status)}</div>`;
  return `<div class="card status-${escapeHtml(r.status)}">
    ${thumb}
    <div class="meta">
      <div class="title">${escapeHtml(r.url)}</div>
      <div class="row"><span class="badge">${escapeHtml(r.role)}</span><span class="pill ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></div>
      ${r.note ? `<div class="note">${escapeHtml(r.note)}</div>` : ""}
    </div>
  </div>`;
}

function render(results, meta) {
  const frontends = [...new Set(results.map((r) => r.frontend))];
  let body = "";
  for (const fe of frontends) {
    const feResults = results.filter((r) => r.frontend === fe);
    const areas = [...new Set(feResults.map((r) => r.area))];
    body += `<section><h2>${escapeHtml(fe)}</h2><div class="lanes">`;
    for (const area of areas) {
      const lane = feResults
        .filter((r) => r.area === area)
        .sort((a, b) => a.url.localeCompare(b.url));
      body += `<div class="lane"><h3>${escapeHtml(area || "root")}</h3>${lane.map(card).join("")}</div>`;
    }
    body += `</div></section>`;
  }
  const s = meta.summary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contentor screenshot map</title><style>${CSS}</style></head><body>
<header><h1>Contentor screenshot map</h1>
<p>${escapeHtml(meta.generatedAt)} · ${escapeHtml(meta.commit)} · ${s.ok} ok / ${s.error} error / ${s.skipped} skipped</p></header>
${body}</body></html>`;
}

module.exports = { render, summarize, escapeHtml };
