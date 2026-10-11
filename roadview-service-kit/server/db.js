'use strict';
// SQLite (node:sqlite, built into Node 22) holds node records; images live on disk.
const { DatabaseSync } = require('node:sqlite');

module.exports = function open(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL, rev INTEGER NOT NULL,
      data TEXT NOT NULL, render TEXT NOT NULL DEFAULT '{}', created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS nodes_geo ON nodes (lat, lon);`);
  const sel = db.prepare('SELECT * FROM nodes ORDER BY created, id');
  const one = db.prepare('SELECT * FROM nodes WHERE id = ?');
  const ins = db.prepare(`INSERT INTO nodes (id, lat, lon, rev, data, render, created) VALUES (?, ?, ?, ?, ?, '{}', ?)
    ON CONFLICT(id) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, rev = excluded.rev, data = excluded.data, render = '{}'`);
  const del = db.prepare('DELETE FROM nodes WHERE id = ?');
  const setR = db.prepare('UPDATE nodes SET render = ? WHERE id = ? AND rev = ?');
  const box = db.prepare('SELECT * FROM nodes WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?');

  function row(r) {
    if (!r) return null;
    const node = JSON.parse(r.data);
    node.rev = r.rev; node.render = JSON.parse(r.render);
    return node;
  }
  return {
    list: () => sel.all().map(row),
    get: (id) => row(one.get(id)),
    put(node) {
      const prev = one.get(node.id), rev = prev ? prev.rev + 1 : 1;
      const data = Object.assign({}, node); delete data.rev; delete data.render;
      ins.run(node.id, node.lat, node.lon, rev, JSON.stringify(data), node.createdAt || new Date().toISOString());
      return row(one.get(node.id));
    },
    remove: (id) => { const n = row(one.get(id)); del.run(id); return n; },
    // only applies while the node is still at `rev`, so a stale render never overwrites a newer edit
    setRender: (id, rev, obj) => setR.run(JSON.stringify(obj), id, rev).changes > 0,
    near(lat, lon, dLat, dLon) { return box.all(lat - dLat, lat + dLat, lon - dLon, lon + dLon).map(row); },
    close: () => db.close()
  };
};
