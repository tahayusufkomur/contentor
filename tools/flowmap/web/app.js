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
      { selector: "node[img]", style: { width: 150, height: 94, shape: "round-rectangle", "background-fit": "cover", "background-image": "data(img)", "background-color": "#1b1f2a", "border-width": 2, "border-color": "#3b4252", label: "data(label)", "font-size": 8, color: "#c7ccd6", "text-valign": "bottom", "text-margin-y": 4, "text-max-width": 150, "text-wrap": "ellipsis" } },
      { selector: "node[!img]", style: { width: 150, height: 94, shape: "round-rectangle", "background-color": "#222a3a", "border-width": 2, "border-color": "#3b4252", label: "data(label)", "font-size": 8, color: "#9aa1ad", "text-valign": "bottom", "text-margin-y": 4, "text-max-width": 150, "text-wrap": "ellipsis" } },
      { selector: "edge", style: { width: 1.5, "line-color": "#5b6477", "target-arrow-color": "#5b6477", "target-arrow-shape": "triangle", "arrow-scale": 0.9, "curve-style": "bezier", label: "data(label)", "font-size": 8, color: "#9aa1ad", "text-background-color": "#0f1115", "text-background-opacity": 1, "text-background-padding": 2 } },
    ],
    layout: { name: "dagre", rankDir: "LR", nodeSep: 30, rankSep: 80, padding: 30 },
  });

  cy.on("dbltap", "node", async (e) => {
    const s = await (await fetch("/api/screens/" + encodeURIComponent(e.target.id))).json();
    if (!s || !s.full) return;
    document.getElementById("lbimg").src = s.full;
    document.getElementById("lbcap").textContent = (s.url || "") + "  ·  " + (s.role || "");
    lb.style.display = "flex";
  });
}

lb.addEventListener("click", () => { lb.style.display = "none"; });
loadFlows();
