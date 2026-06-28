// tools/flowmap/flows.js
function buildPrompt(screens, edges) {
  const screenLines = screens
    .map((s) => `${s.key} [${s.role || "?"}] ${s.title ? `"${s.title}" ` : ""}${s.url}`)
    .join("\n");
  const edgeLines = edges.map((e) => `${e.source} -> ${e.target}`).join("\n");
  return [
    "You are mapping the user flows of a web app from its screens and navigation links.",
    "",
    'Screens (key [role] "title" url):',
    screenLines,
    "",
    "Navigation links (source -> target):",
    edgeLines,
    "",
    "Identify the distinct, coherent USER FLOWS — real journeys a user takes (e.g. sign up & subscribe,",
    "browse & buy a course, coach creates a course). A flow may span roles. Aim for 4-10 focused flows.",
    "",
    "Return ONLY a JSON array, no prose, no markdown fences. Each element:",
    '{ "name": string, "description": string, "steps": [ { "from": <screen key>, "to": <screen key>, "label": <short action> } ] }',
    "Use only the screen keys listed above. Order the steps in the direction the user progresses.",
  ].join("\n");
}

function parseFlows(text, validKeys) {
  const valid = new Set(validKeys);
  const warnings = [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  let arr;
  try {
    arr = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    return { flows: [], warnings: ["could not parse a JSON array from claude output"] };
  }
  if (!Array.isArray(arr)) return { flows: [], warnings: ["claude output was not a JSON array"] };

  const flows = [];
  for (const f of arr) {
    if (!f || typeof f.name !== "string" || !Array.isArray(f.steps)) {
      warnings.push("dropped a malformed flow");
      continue;
    }
    const steps = [];
    for (const st of f.steps) {
      if (!st || typeof st.from !== "string" || typeof st.to !== "string") {
        warnings.push(`flow "${f.name}": dropped a malformed step`);
        continue;
      }
      if (!valid.has(st.from)) warnings.push(`flow "${f.name}": unknown screen ${st.from}`);
      if (!valid.has(st.to)) warnings.push(`flow "${f.name}": unknown screen ${st.to}`);
      steps.push({ from: st.from, to: st.to, label: typeof st.label === "string" ? st.label : null });
    }
    if (steps.length) flows.push({ name: f.name, description: typeof f.description === "string" ? f.description : null, steps });
    else warnings.push(`flow "${f.name}": no valid steps, dropped`);
  }
  return { flows, warnings };
}

module.exports = { buildPrompt, parseFlows };
