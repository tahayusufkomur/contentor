// tools/flowmap/web/app.js
cytoscape.use(cytoscapeDagre);

const flowsEl = document.getElementById("flows");
const cyEl = document.getElementById("cy");
const lb = document.getElementById("lb");
let cy = null;
let flowKeys = []; // ordered screen keys of the current flow (for lightbox navigation)
let lbIndex = -1;

async function loadFlows() {
  const flows = await (await fetch("/api/flows")).json();
  flowsEl.innerHTML = "";
  if (!flows.length) {
    flowsEl.innerHTML = '<div class="empty">No flows registered yet. Run <code>make flowmap-register</code>.</div>';
    return;
  }
  flows.forEach((f, i) => {
    const btn = document.createElement("button");
    btn.className = "flow";
    btn.append(document.createTextNode(f.name));
    const c = document.createElement("span");
    c.className = "count";
    c.textContent = f.stepCount;
    btn.append(c);
    btn.onclick = () => {
      document.querySelectorAll(".flow").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      showFlow(f.id);
    };
    flowsEl.append(btn);
    if (i === 0) btn.click();
  });
}

async function showFlow(id) {
  const flow = await (await fetch("/api/flows/" + id)).json();
  const byKey = Object.fromEntries(flow.screens.map((s) => [s.key, s]));
  const elements = [];
  const seen = new Set();
  const order = [];
  const addNode = (k) => {
    if (seen.has(k)) return;
    seen.add(k);
    order.push(k);
    const s = byKey[k] || { key: k, url: k, role: "" };
    const data = { id: k, label: s.url || k, role: s.role || "" };
    if (s.thumb) data.img = s.thumb;
    elements.push({ data });
  };
  flow.steps.forEach((st, i) => {
    addNode(st.from);
    addNode(st.to);
    elements.push({ data: { id: "e" + i, source: st.from, target: st.to, label: st.label || "" } });
  });
  flowKeys = order; // step order, used to navigate the lightbox with ‹ ›/arrows

  if (cy) cy.destroy();
  cy = cytoscape({
    container: cyEl,
    elements,
    style: [
      { selector: "node[img]", style: { width: 256, height: 160, shape: "round-rectangle", "background-fit": "cover", "background-image": "data(img)", "background-color": "#1b1f2a", "border-width": 2, "border-color": "#3b4252", label: "data(label)", "font-size": 10, color: "#c7ccd6", "text-valign": "bottom", "text-margin-y": 5, "text-max-width": 256, "text-wrap": "ellipsis" } },
      { selector: "node[!img]", style: { width: 256, height: 160, shape: "round-rectangle", "background-color": "#222a3a", "border-width": 2, "border-color": "#3b4252", label: "data(label)", "font-size": 10, color: "#9aa1ad", "text-valign": "bottom", "text-margin-y": 5, "text-max-width": 256, "text-wrap": "ellipsis" } },
      { selector: "node:selected", style: { "border-width": 3, "border-color": "#7aa2f7" } },
      { selector: "edge", style: { width: 1.5, "line-color": "#5b6477", "target-arrow-color": "#5b6477", "target-arrow-shape": "triangle", "arrow-scale": 1, "curve-style": "bezier", label: "data(label)", "font-size": 10, color: "#9aa1ad", "text-background-color": "#0f1115", "text-background-opacity": 1, "text-background-padding": 3 } },
    ],
    layout: { name: "dagre", rankDir: "LR", nodeSep: 44, rankSep: 130, padding: 40 },
  });

  // One click opens the screenshot.
  cy.on("tap", "node", (e) => openLightbox(e.target.id()));
}

function isOpen() {
  return lb.style.display !== "none" && lb.style.display !== "";
}

async function showScreen(key) {
  const s = await (await fetch("/api/screens/" + encodeURIComponent(key))).json();
  if (!s || !s.full) return;
  document.getElementById("lbimg").src = s.full;
  const pos = flowKeys.length > 1 ? `   (${lbIndex + 1}/${flowKeys.length})` : "";
  document.getElementById("lbcap").textContent = (s.url || key) + "  ·  " + (s.role || "") + pos;
  // Only offer navigation when the flow has more than one screen.
  const show = flowKeys.length > 1 ? "flex" : "none";
  document.getElementById("lbprev").style.display = show;
  document.getElementById("lbnext").style.display = show;
  lb.style.display = "flex";
}

function openLightbox(key) {
  const i = flowKeys.indexOf(key);
  lbIndex = i >= 0 ? i : 0;
  showScreen(flowKeys[lbIndex] ?? key);
}

function step(delta) {
  if (!isOpen() || flowKeys.length < 2) return;
  lbIndex = (lbIndex + delta + flowKeys.length) % flowKeys.length;
  showScreen(flowKeys[lbIndex]);
}

function closeLightbox() {
  lb.style.display = "none";
  document.getElementById("lbimg").src = "";
}

// Clicking the backdrop/image closes; the nav buttons navigate (and must not close).
lb.addEventListener("click", closeLightbox);
document.getElementById("lbprev").addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
document.getElementById("lbnext").addEventListener("click", (e) => { e.stopPropagation(); step(1); });
document.addEventListener("keydown", (e) => {
  if (!isOpen()) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});
loadFlows();
