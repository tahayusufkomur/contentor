// The editor page: one docs/diagrams/<name>.excalidraw at a time (#<name>),
// saved back to that file a moment after every change.
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const NAME = /^[a-z0-9][a-z0-9-]*$/; // same rule as server.mjs
const EMPTY = {
  type: "excalidraw",
  version: 2,
  elements: [],
  appState: {},
  files: {},
};
const url = (name) => `/api/diagrams/${name}`;

// Writes go out one at a time and in order; a scene equal to the file is never written.
function useAutosave(name) {
  const s = useRef({
    saved: null,
    pending: null,
    timer: 0,
    queue: Promise.resolve(),
  }).current;
  const flush = () => {
    clearTimeout(s.timer);
    const json = s.pending;
    s.pending = null;
    if (json === null || json === s.saved) return;
    s.saved = json;
    s.queue = s.queue
      .then(() => fetch(url(name), { method: "PUT", body: json }))
      .then((r) => r.ok || Promise.reject(new Error(`HTTP ${r.status}`)))
      .catch((err) => alert(`Could not save ${name}: ${err.message}`));
  };
  useEffect(() => {
    const onLeave = (e) => {
      if (s.pending === null) return;
      flush();
      e.preventDefault(); // "Leave site?" while the last write is still in flight
    };
    addEventListener("beforeunload", onLeave);
    return () => {
      removeEventListener("beforeunload", onLeave);
      flush();
    };
  }, []);
  return (elements, appState, files) => {
    const json = serializeAsJSON(elements, appState, files, "local");
    if (s.saved === null) s.saved = json; // first call: the file as loaded
    s.pending = json === s.saved ? null : json; // an undo back to the file cancels the write
    clearTimeout(s.timer);
    if (s.pending !== null) s.timer = setTimeout(flush, 400);
  };
}

function Diagram({ name, picker }) {
  const [scene, setScene] = useState(null);
  const [error, setError] = useState(null);
  const onChange = useAutosave(name);
  useEffect(() => {
    document.title = `${name} · Contentor diagrams`;
    fetch(url(name))
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`no diagram "${name}"`)),
      )
      .then(setScene, setError);
  }, [name]);
  if (error)
    return (
      <p style={{ padding: 24, fontFamily: "system-ui" }}>{error.message}</p>
    );
  if (!scene) return null;
  return (
    <Excalidraw
      initialData={{ ...scene, scrollToContent: true }}
      onChange={onChange}
      renderTopRightUI={picker}
    />
  );
}

function App() {
  const [names, setNames] = useState([]);
  const [name, setName] = useState(location.hash.slice(1));
  useEffect(() => {
    // re-read on focus too: diagrams get added to docs/diagrams while the editor is open
    const refresh = () =>
      fetch("/api/diagrams")
        .then((r) => r.json())
        .then((list) => {
          setNames(list);
          if (!location.hash && list.length) location.hash = list[0];
        });
    const onHash = () => {
      setName(location.hash.slice(1));
      refresh();
    };
    refresh();
    addEventListener("hashchange", onHash);
    addEventListener("focus", refresh);
    return () => {
      removeEventListener("hashchange", onHash);
      removeEventListener("focus", refresh);
    };
  }, []);

  const create = async () => {
    const next = prompt("New diagram name (a-z, 0-9, dashes)")?.trim();
    if (!next) return;
    if (!NAME.test(next)) return alert("Use a-z, 0-9 and dashes only.");
    if (!names.includes(next)) {
      const r = await fetch(url(next), {
        method: "PUT",
        body: JSON.stringify(EMPTY),
      });
      if (!r.ok) return alert(`Could not create ${next}: HTTP ${r.status}`);
      setNames([...names, next].sort());
    }
    location.hash = next;
  };

  const picker = () => (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        aria-label="Diagram"
        value={name}
        onChange={(e) => (location.hash = e.target.value)}
        style={{ font: "inherit", padding: "0 8px", borderRadius: 8 }}
      >
        {names.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={create}
        style={{ font: "inherit", padding: "0 12px", borderRadius: 8 }}
      >
        New
      </button>
    </div>
  );

  if (!name) {
    return (
      <p style={{ padding: 24, fontFamily: "system-ui" }}>
        No diagrams in docs/diagrams yet.{" "}
        <button onClick={create}>New diagram</button>
      </p>
    );
  }
  return <Diagram key={name} name={name} picker={picker} />;
}

createRoot(document.getElementById("root")).render(<App />);
