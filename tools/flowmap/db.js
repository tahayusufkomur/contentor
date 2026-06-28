const { DatabaseSync } = require("node:sqlite");

function open(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS screens (
      key TEXT PRIMARY KEY, url TEXT NOT NULL, role TEXT, frontend TEXT, title TEXT,
      thumb TEXT, full TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
      from_key TEXT NOT NULL, to_key TEXT NOT NULL, ord INTEGER NOT NULL, label TEXT
    );
  `);

  const now = () => new Date().toISOString();
  return {
    upsertScreen(s) {
      db.prepare(`
        INSERT INTO screens (key, url, role, frontend, title, thumb, full, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          url = excluded.url, role = excluded.role, frontend = excluded.frontend,
          title = excluded.title, thumb = excluded.thumb, full = excluded.full, updated_at = excluded.updated_at
      `).run(s.key, s.url, s.role ?? null, s.frontend ?? null, s.title ?? null, s.thumb ?? null, s.full ?? null, now());
    },
    getScreens() {
      return db.prepare(`SELECT key, url, role, frontend, title, thumb FROM screens ORDER BY key`).all();
    },
    getScreen(key) {
      return db.prepare(`SELECT key, url, role, frontend, title, thumb, full FROM screens WHERE key = ?`).get(key) ?? null;
    },
    createFlow({ name, description, steps }) {
      const info = db.prepare(`INSERT INTO flows (name, description, created_at) VALUES (?, ?, ?)`).run(name, description ?? null, now());
      const flowId = Number(info.lastInsertRowid);
      const ins = db.prepare(`INSERT INTO flow_steps (flow_id, from_key, to_key, ord, label) VALUES (?, ?, ?, ?, ?)`);
      (steps || []).forEach((st, i) => ins.run(flowId, st.from, st.to, i, st.label ?? null));
      return flowId;
    },
    listFlows() {
      return db.prepare(`
        SELECT f.id, f.name, f.description,
          (SELECT COUNT(*) FROM flow_steps s WHERE s.flow_id = f.id) AS stepCount
        FROM flows f ORDER BY f.id
      `).all();
    },
    getFlow(id) {
      const flow = db.prepare(`SELECT id, name, description FROM flows WHERE id = ?`).get(id);
      if (!flow) return null;
      const steps = db.prepare(`SELECT from_key AS "from", to_key AS "to", ord, label FROM flow_steps WHERE flow_id = ? ORDER BY ord`).all(id);
      const keys = [...new Set(steps.flatMap((s) => [s.from, s.to]))];
      const screens = keys.length
        ? db.prepare(`SELECT key, url, role, title, thumb FROM screens WHERE key IN (${keys.map(() => "?").join(",")})`).all(...keys)
        : [];
      return { ...flow, steps, screens };
    },
    deleteFlow(id) {
      db.prepare(`DELETE FROM flows WHERE id = ?`).run(id);
    },
    reset() {
      db.exec(`DELETE FROM flow_steps; DELETE FROM flows; DELETE FROM screens;`);
    },
    close() {
      db.close();
    },
  };
}

module.exports = { open };
