const express = require("express");
const { proj } = require("../db");

function createActivityRouter() {
  const router = express.Router();

  router.get("/api/activity", async (req, res) => {
    try {
      const [rows] = await proj.query("SELECT * FROM events ORDER BY id DESC");
      res.status(200).json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/activity/names", async (req, res) => {
    try {
      const [rows] = await proj.query(`
        SELECT event_name, COUNT(*) AS hits
        FROM events
        GROUP BY event_name
        ORDER BY hits DESC
      `);
      res.status(200).json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/activity/categories", async (req, res) => {
    try {
      const [rows] = await proj.query(`
        SELECT event_category, COUNT(*) AS hits
        FROM events
        GROUP BY event_category
        ORDER BY hits DESC
      `);
      res.status(200).json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/activity/urls", async (req, res) => {
    try {
      const [rows] = await proj.query(`
        SELECT url, COUNT(*) AS hits
        FROM events
        GROUP BY url
        ORDER BY hits DESC
      `);
      res.status(200).json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/activity/:id", async (req, res) => {
    try {
      const [rows] = await proj.query("SELECT * FROM events WHERE id = ?", [req.params.id]);
      if (!rows.length) return res.status(404).json({ ok: false, error: "Not found" });
      res.status(200).json({ ok: true, data: rows[0] });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/api/activity", async (req, res) => {
    const { session_id, event_name, event_category, event_data, url, server_timestamp, created_at } =
      req.body || {};

    try {
      const payload =
        event_data && typeof event_data === "object" ? JSON.stringify(event_data) : event_data ?? null;
      const generatedSessionId =
        session_id || `api-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const [result] = await proj.query(
        `INSERT INTO events (session_id, event_name, event_category, event_data, url, server_timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()), COALESCE(?, NOW()))`,
        [
          generatedSessionId,
          event_name || "unknown_event",
          event_category || "interaction",
          payload,
          url || "/",
          server_timestamp ?? null,
          created_at ?? null,
        ]
      );
      res.status(201).json({ ok: true, id: result.insertId });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.put("/api/activity/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "id must be a positive integer" });
    }

    const { session_id, event_name, event_category, event_data, url, server_timestamp, created_at } =
      req.body || {};

    try {
      const payload = event_data && typeof event_data === "object" ? JSON.stringify(event_data) : event_data;
      const [result] = await proj.query(
        `UPDATE events
         SET session_id = COALESCE(?, session_id),
             event_name = COALESCE(?, event_name),
             event_category = COALESCE(?, event_category),
             event_data = COALESCE(?, event_data),
             url = COALESCE(?, url),
             server_timestamp = COALESCE(?, server_timestamp),
             created_at = COALESCE(?, created_at)
         WHERE id = ?`,
        [
          session_id ?? null,
          event_name ?? null,
          event_category ?? null,
          payload ?? null,
          url ?? null,
          server_timestamp ?? null,
          created_at ?? null,
          id,
        ]
      );
      if (!result.affectedRows) {
        return res.status(404).json({ ok: false, error: "Not found" });
      }
      res.status(200).json({ ok: true, updated: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.delete("/api/activity/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "id must be a positive integer" });
    }

    try {
      const [result] = await proj.query("DELETE FROM events WHERE id = ?", [id]);
      if (!result.affectedRows) {
        return res.status(404).json({ ok: false, error: "Not found" });
      }
      res.status(200).json({ ok: true, deleted: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = createActivityRouter;
