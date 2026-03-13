const express = require("express");
const { proj } = require("../db");

function createStaticRouter() {
  const router = express.Router();

  router.get("/api/static", async (req, res) => {
    try {
      const [rows] = await proj.query(
        `SELECT
           id,
           url,
           type,
           user_agent,
           JSON_UNQUOTE(JSON_EXTRACT(payload, '$.language')) AS language,
           viewport_width AS screen_width,
           viewport_height AS screen_height,
           referrer,
           client_timestamp,
           server_timestamp,
           client_ip,
           session_id,
           payload,
           created_at
         FROM pageviews
         ORDER BY id DESC`
      );
      res.status(200).json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/static/useragents", async (req, res) => {
    try {
      const [rows] = await proj.query(`
        SELECT user_agent, COUNT(*) AS hits
        FROM pageviews
        GROUP BY user_agent
        ORDER BY hits DESC
      `);
      res.status(200).json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/static/languages", async (req, res) => {
    try {
      const [rows] = await proj.query(`
        SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.language')) AS language, COUNT(*) AS hits
        FROM pageviews
        WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.language')) IS NOT NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.language')) <> ''
        GROUP BY language
        ORDER BY hits DESC
      `);
      res.status(200).json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/static/screensizes", async (req, res) => {
    try {
      const [rows] = await proj.query(`
        SELECT
          CONCAT(viewport_width, 'x', viewport_height) AS screen_size,
          COUNT(*) AS hits
        FROM pageviews
        WHERE viewport_width IS NOT NULL
          AND viewport_height IS NOT NULL
        GROUP BY viewport_width, viewport_height
        ORDER BY hits DESC
      `);
      res.status(200).json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/api/static/:id", async (req, res) => {
    try {
      const [rows] = await proj.query(
        `SELECT
           id,
           url,
           type,
           user_agent,
           JSON_UNQUOTE(JSON_EXTRACT(payload, '$.language')) AS language,
           viewport_width AS screen_width,
           viewport_height AS screen_height,
           referrer,
           client_timestamp,
           server_timestamp,
           client_ip,
           session_id,
           payload,
           created_at
         FROM pageviews
         WHERE id = ?`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: "Not found" });
      res.status(200).json({ ok: true, data: rows[0] });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/api/static", async (req, res) => {
    const {
      url,
      type,
      user_agent,
      language,
      screen_width,
      screen_height,
      referrer,
      client_timestamp,
      server_timestamp,
      client_ip,
      session_id,
      payload,
      created_at,
    } = req.body || {};

    try {
      const payloadObj = payload && typeof payload === "object" ? { ...payload } : {};
      if (language != null && payloadObj.language == null) {
        payloadObj.language = language;
      }
      const payloadJson = Object.keys(payloadObj).length ? JSON.stringify(payloadObj) : null;
      const generatedSessionId =
        session_id || `api-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const [result] = await proj.query(
        `INSERT INTO pageviews
         (url, type, user_agent, viewport_width, viewport_height, referrer, client_timestamp, server_timestamp, client_ip, session_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, COALESCE(?, NOW()))`,
        [
          url || "/",
          type || "pageview",
          user_agent || null,
          screen_width ?? null,
          screen_height ?? null,
          referrer ?? null,
          client_timestamp ?? null,
          server_timestamp ?? null,
          client_ip ?? null,
          generatedSessionId,
          payloadJson,
          created_at ?? null,
        ]
      );
      res.status(201).json({ ok: true, id: result.insertId });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.put("/api/static/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "id must be a positive integer" });
    }

    const { user_agent, language, screen_width, screen_height, server_timestamp, created_at } =
      req.body;

    try {
      const [result] = await proj.query(
        `UPDATE pageviews
         SET user_agent = ?,
             viewport_width = ?,
             viewport_height = ?,
             server_timestamp = COALESCE(?, server_timestamp),
             created_at = COALESCE(?, created_at),
             payload = CASE
               WHEN ? IS NULL THEN payload
               ELSE JSON_SET(COALESCE(payload, JSON_OBJECT()), '$.language', ?)
             END
         WHERE id = ?`,
        [
          user_agent ?? null,
          screen_width ?? null,
          screen_height ?? null,
          server_timestamp ?? null,
          created_at ?? null,
          language ?? null,
          language ?? null,
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

  router.delete("/api/static/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "id must be a positive integer" });
    }

    try {
      const [result] = await proj.query("DELETE FROM pageviews WHERE id = ?", [id]);
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

module.exports = createStaticRouter;
