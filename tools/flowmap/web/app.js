// tools/flowmap/web/app.js
cytoscape.use(cytoscapeDagre);

const flowsEl = document.getElementById("flows");
const cyEl = document.getElementById("cy");
const lb = document.getElementById("lb");
let cy = null;

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
  const addNode = (k) => {
    if (seen.has(k)) return;
    seen.add(k);
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

  // Cytoscape has no reliable built-in double-tap, so detect it: two taps on the
  // same node within 350ms opens the full screenshot. Single tap stays free.
  let last = { id: null, t: 0 };
  cy.on("tap", "node", (e) => {
    const id = e.target.id();
    const now = Date.now();
    if (last.id === id && now - last.t < 350) {
      last = { id: null, t: 0 };
      openLightbox(id);
    } else {
      last = { id, t: now };
    }
  });
}

async function openLightbox(key) {
  const s = await (await fetch("/api/screens/" + encodeURIComponent(key))).json();
  if (!s || !s.full) return;
  document.getElementById("lbimg").src = s.full;
  document.getElementById("lbcap").textContent = (s.url || key) + "  ·  " + (s.role || "");
  lb.style.display = "flex";
}

function closeLightbox() {
  lb.style.display = "none";
  document.getElementById("lbimg").src = "";
}
lb.addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});
loadFlows();
