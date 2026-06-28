// tools/flowmap/web/app.js
cytoscape.use(cytoscapeDagre);

const flowsEl = document.getElementById("flows");
const cyEl = document.getElementById("cy");
const lb = document.getElementById("lb");
let cy = null;
// Lightbox navigation follows the flow's DAG: from the current screen you step along
// outgoing edges (choosing at branches), and Back retraces the path you took.
let flowOut = {}; // key -> [{ to, label }] outgoing edges
let flowByKey = {}; // key -> { url, role }
let lbHistory = []; // keys visited to reach the current one
let lbCurrent = null;

async function loadFlows() {
  const flows = await (await fetch("/api/flows")).json();
  flowsEl.innerHTML = "";
  if (!flows.length) {
    flowsEl.innerHTML = '<div class="empty">No flows registered yet. Run <code>make flowmap-register</code>.</div>';
    return;
  }
  // Group flows by their primary role so the sidebar reads superadmin / coach /
  // student / public instead of one long list.
  const ROLE_ORDER = ["superadmin", "coach", "student", "anon"];
  const ROLE_LABEL = { superadmin: "Superadmin", coach: "Coach", student: "Student", anon: "Public" };
  const groups = {};
  flows.forEach((f) => { (groups[f.role || "anon"] ||= []).push(f); });

  const makeBtn = (f) => {
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
    // Right-click → copy a text reference of the flow to paste to Claude.
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showFlowMenu(e.clientX, e.clientY, f.id);
    });
    return btn;
  };

  let firstBtn = null;
  for (const role of ROLE_ORDER) {
    const list = groups[role];
    if (!list || !list.length) continue;
    const h = document.createElement("h2");
    h.className = "role-group";
    h.textContent = ROLE_LABEL[role] || role;
    flowsEl.append(h);
    for (const f of list) {
      const btn = makeBtn(f);
      flowsEl.append(btn);
      if (!firstBtn) firstBtn = btn;
    }
  }
  if (firstBtn) firstBtn.click();
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
  flowOut = {};
  flowByKey = {};
  flow.steps.forEach((st, i) => {
    addNode(st.from);
    addNode(st.to);
    (flowOut[st.from] ||= []).push({ to: st.to, label: st.label || "" });
    elements.push({ data: { id: "e" + i, source: st.from, target: st.to, label: st.label || "" } });
  });
  for (const k of order) flowByKey[k] = byKey[k] || { url: k, role: "" };
  void order;

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

const optsEl = document.getElementById("lbopts");

function labelFor(key) {
  return (flowByKey[key] && flowByKey[key].url) || key;
}

async function showScreen(key) {
  const s = await (await fetch("/api/screens/" + encodeURIComponent(key))).json();
  if (!s || !s.full) return;
  lbCurrent = key;
  document.getElementById("lbimg").src = s.full;
  document.getElementById("lbcap").textContent = (s.url || key) + "  ·  " + (s.role || "");

  // Back button is available whenever we've stepped into the flow.
  document.getElementById("lbprev").style.display = lbHistory.length ? "flex" : "none";

  // Forward: one numbered option per outgoing edge — always shown, even for a single
  // next step, so you can drive a whole path by tapping 1,1,1,… (and branches just
  // offer 1,2,3…). Press the number or click the option.
  const outs = flowOut[key] || [];
  optsEl.innerHTML = "";
  outs.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "lbopt";
    b.textContent = `${i + 1}. ${o.label || labelFor(o.to)} →`;
    b.addEventListener("click", (e) => { e.stopPropagation(); goForward(o.to); });
    optsEl.append(b);
  });
  lb.style.display = "flex";
}

function openLightbox(key) {
  lbHistory = [];
  showScreen(key);
}

function goForward(toKey) {
  if (lbCurrent != null) lbHistory.push(lbCurrent);
  showScreen(toKey);
}

function goForwardNth(n) {
  const outs = flowOut[lbCurrent] || [];
  if (outs[n]) goForward(outs[n].to);
}

function goBack() {
  if (lbHistory.length) showScreen(lbHistory.pop());
}

function closeLightbox() {
  lb.style.display = "none";
  document.getElementById("lbimg").src = "";
}

// Clicking the backdrop/image closes; the nav controls drive and must not close.
lb.addEventListener("click", closeLightbox);
document.getElementById("lbbar").addEventListener("click", (e) => e.stopPropagation());
document.getElementById("lbprev").addEventListener("click", (e) => { e.stopPropagation(); goBack(); });
document.addEventListener("keydown", (e) => {
  if (!isOpen()) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft" || e.key === "Backspace") { e.preventDefault(); goBack(); }
  else if (e.key === "ArrowRight") goForwardNth(0); // follow the first (or only) next step
  else if (/^[1-9]$/.test(e.key)) goForwardNth(Number(e.key) - 1);
});

// --- Right-click flow menu → copy a text reference (same shape as the consult CLI,
// so a pasted flow reads to Claude exactly like `make flowmap-show ARGS=<id>`). ---
const menuEl = document.getElementById("flowmenu");
const toastEl = document.getElementById("toast");

function hideFlowMenu() {
  menuEl.style.display = "none";
}

function showFlowMenu(x, y, id) {
  menuEl.innerHTML = "";
  const item = document.createElement("button");
  item.className = "menuitem";
  item.textContent = "Copy flow as text";
  item.addEventListener("click", () => {
    hideFlowMenu();
    copyFlowText(id);
  });
  menuEl.append(item);
  menuEl.style.display = "block";
  menuEl.style.left = "0px";
  menuEl.style.top = "0px";
  // Clamp to viewport once we know the menu's size.
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.min(x, window.innerWidth - r.width - 8) + "px";
  menuEl.style.top = Math.min(y, window.innerHeight - r.height - 8) + "px";
}

document.addEventListener("click", hideFlowMenu);
document.addEventListener("scroll", hideFlowMenu, true);
window.addEventListener("blur", hideFlowMenu);

function flowToText(flow) {
  const lines = [];
  lines.push(`flowmap #${flow.id}  ${flow.name}${flow.description ? ` — ${flow.description}` : ""}`);
  for (const st of flow.steps) {
    const arrow = st.label ? `--[${st.label}]-->` : "-->";
    lines.push(`    ${st.from}  ${arrow}  ${st.to}`);
  }
  return lines.join("\n");
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.display = "none"; }, 1800);
}

async function copyFlowText(id) {
  try {
    const flow = await (await fetch("/api/flows/" + id)).json();
    const text = flowToText(flow);
    await navigator.clipboard.writeText(text);
    toast("Flow copied to clipboard");
  } catch (err) {
    // clipboard API needs a secure context / focus; fall back to a manual prompt.
    try {
      const flow = await (await fetch("/api/flows/" + id)).json();
      window.prompt("Copy this flow:", flowToText(flow));
    } catch {
      toast("Couldn't copy flow");
    }
  }
}

loadFlows();
