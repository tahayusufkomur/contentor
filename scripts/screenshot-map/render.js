// scripts/screenshot-map/render.js
const { cytoscapeSource } = require("./vendor");

const BOARD_CSS = `
  html, body { margin: 0; height: 100%; background: #0f1115; color: #e7e9ee; font: 14px system-ui, sans-serif; }
  header { position: fixed; top: 0; left: 0; right: 0; z-index: 5; padding: 10px 16px; background: rgba(15,17,21,.92); border-bottom: 1px solid #262a33; }
  header h1 { margin: 0; font-size: 15px; display: inline; }
  header span { color: #9aa1ad; margin-left: 10px; font-size: 12px; }
  header .toggle { color: #9aa1ad; margin-left: 12px; font-size: 12px; cursor: pointer; user-select: none; }
  #cy { position: absolute; inset: 0; }
  #lb { position: fixed; inset: 0; z-index: 10; background: rgba(0,0,0,.85); display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px; cursor: zoom-out; }
  #lb img { max-width: 92vw; max-height: 82vh; border: 1px solid #2b3040; border-radius: 8px; }
  #lb .cap { color: #c7ccd6; font-size: 13px; }
`;

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function summarize(results) {
  const s = { ok: 0, error: 0, skipped: 0 };
  for (const r of results) s[r.status] = (s[r.status] || 0) + 1;
  return s;
}

function buildElements(graph) {
  const elements = [];
  for (const c of [...new Set(graph.nodes.map((n) => n.cluster))]) {
    elements.push({ data: { id: c, label: c, isCluster: 1 } });
  }
  for (const n of graph.nodes) {
    const data = { id: n.id, parent: n.cluster, label: n.label, role: n.role, status: n.status };
    // `thumb`/`full` are already downscaled data: URLs (from thumbnail.js). Only set `img`
    // when there's a real thumbnail — an empty img ("") still matches the node[img] selector,
    // applies background-image:"" and crashes Cytoscape's image loader; omitting the key
    // routes imgless (skipped/error) nodes to the node[!img] plain-box style.
    if (n.thumb) data.img = n.thumb;
    if (n.full) data.full = n.full;
    elements.push({ data });
  }
  graph.edges.forEach((e, i) => elements.push({ data: { id: `e${i}`, source: e.source, target: e.target } }));
  return elements;
}

function render(graph, meta, opts = {}) {
  const cyto = opts.cytoscapeSrc != null ? opts.cytoscapeSrc : cytoscapeSource();
  const elementsJson = JSON.stringify(buildElements(graph)).replace(/</g, "\\u003c");
  const s = meta.summary;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contentor screenshot map</title><style>${BOARD_CSS}</style></head><body>
<header><h1>Contentor screenshot map</h1>
<span>${escapeHtml(meta.generatedAt)} · ${escapeHtml(meta.commit)} · ${s.ok} ok / ${s.error} error / ${s.skipped} skipped · ${graph.suppressedCount} global-nav links hidden · click a node to trace its links, double-click to enlarge</span>
<label class="toggle"><input type="checkbox" id="showAll"> show all links</label>
</header>
<div id="cy"></div>
<div id="lb"><img id="lbimg" alt=""><div class="cap" id="lbcap"></div></div>
<script>${cyto}</script>
<script>
const elements = ${elementsJson};
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements,
  style: [
    { selector: 'node[?isCluster]', style: { 'background-opacity': 0.05, 'background-color': '#7aa2f7', 'border-width': 1, 'border-color': '#2b3040', 'shape': 'round-rectangle', 'padding': 18, 'label': 'data(label)', 'color': '#9aa1ad', 'font-size': 12, 'text-valign': 'top', 'text-halign': 'center' } },
    { selector: 'node[img]', style: { 'width': 120, 'height': 75, 'shape': 'round-rectangle', 'background-fit': 'cover', 'background-image': 'data(img)', 'background-color': '#1b1f2a', 'border-width': 3, 'border-color': '#3b4252', 'label': 'data(label)', 'font-size': 7, 'color': '#c7ccd6', 'text-valign': 'bottom', 'text-margin-y': 3, 'text-max-width': 120, 'text-wrap': 'ellipsis' } },
    { selector: 'node[!isCluster][!img]', style: { 'width': 120, 'height': 75, 'shape': 'round-rectangle', 'background-color': '#1b1f2a', 'border-width': 3, 'border-color': '#3b4252', 'label': 'data(label)', 'font-size': 7, 'color': '#6b7280', 'text-valign': 'bottom', 'text-margin-y': 3, 'text-max-width': 120, 'text-wrap': 'ellipsis' } },
    { selector: 'node.boxonly', style: { 'background-image': 'none', 'background-color': '#222a3a' } },
    { selector: 'node[status = "ok"]', style: { 'border-color': '#4ade80' } },
    { selector: 'node[status = "error"]', style: { 'border-color': '#f87171' } },
    { selector: 'node[status = "skipped"]', style: { 'border-color': '#fbbf24' } },
    { selector: 'edge', style: { 'width': 1, 'line-color': '#5b6477', 'target-arrow-color': '#5b6477', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.7, 'curve-style': 'straight', 'opacity': 0.8 } },
    { selector: '.faded', style: { 'opacity': 0.1 } },
    { selector: '.hidden', style: { 'display': 'none' } },
  ],
  layout: { name: 'cose', animate: false, nodeRepulsion: 400, idealEdgeLength: 40, componentSpacing: 40, gravity: 4, numIter: 2000, nodeOverlap: 6, padding: 20 },
});
// Level-of-detail: drawing dozens of screenshot textures every frame is the main
// render cost, so when zoomed out we swap thumbnails for plain status boxes (cheap,
// and thumbnails are unreadably small at that zoom anyway); zooming in restores them.
let lodBoxes = null;
function applyLod() {
  const boxes = cy.zoom() < 0.45;
  if (boxes !== lodBoxes) {
    lodBoxes = boxes;
    cy.batch(() => cy.nodes('[img]')[boxes ? 'addClass' : 'removeClass']('boxonly'));
  }
}
cy.on('zoom', applyLod);
applyLod();

// Edges are hidden by default so the board stays clean and renders smoothly with
// hundreds of links; clicking a node reveals just its links, or the header toggle
// shows them all at once.
cy.edges().addClass('hidden');
const showAll = () => document.getElementById('showAll').checked;
function resetEdges() {
  cy.elements().removeClass('faded');
  cy.edges()[showAll() ? 'removeClass' : 'addClass']('hidden');
}
cy.on('tap', 'node', (e) => {
  const n = e.target;
  if (n.data('isCluster')) return;
  cy.elements().addClass('faded');
  n.closedNeighborhood().removeClass('faded');
  n.connectedEdges().removeClass('hidden').removeClass('faded');
});
cy.on('tap', (e) => { if (e.target === cy) resetEdges(); });
document.getElementById('showAll').addEventListener('change', resetEdges);
cy.on('dbltap', 'node', (e) => {
  const img = e.target.data('full') || e.target.data('img');
  if (!img) return;
  document.getElementById('lbimg').src = img;
  document.getElementById('lbcap').textContent = e.target.data('label') + '  ·  ' + e.target.data('role');
  document.getElementById('lb').style.display = 'flex';
});
document.getElementById('lb').addEventListener('click', () => { document.getElementById('lb').style.display = 'none'; });
</script>
</body></html>`;
}

module.exports = { render, summarize, escapeHtml };
