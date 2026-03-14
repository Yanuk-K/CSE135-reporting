const express = require("express");
const bcrypt = require("bcrypt");
const { proj } = require("../db");

function createAdminRouter({ requireAuth, requireRole }) {
  const router = express.Router();
  const allowedSections = new Set(["overview", "sessions", "performance", "errors"]);

  router.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const [rows] = await proj.query(
        `SELECT
           u.id,
           u.email,
           u.display_name,
           u.role,
           u.created_at,
           u.last_login,
           COALESCE(
             (SELECT GROUP_CONCAT(usa.section_key ORDER BY usa.section_key SEPARATOR ',')
              FROM user_section_access usa
              WHERE usa.user_id = u.id),
             ''
           ) AS sections
         FROM users u
         ORDER BY u.id DESC`
      );
      res.status(200).json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { email, password, display_name, role } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ success: false, error: "email and password are required" });
      }

      const newRole = role || "viewer";
      if (!["viewer", "admin", "owner"].includes(newRole)) {
        return res.status(400).json({ success: false, error: "invalid role" });
      }
      if (newRole === "owner" && req.session.role !== "owner") {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      const hash = await bcrypt.hash(password, 10);
      const [result] = await proj.query(
        "INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
        [email, hash, display_name || null, newRole]
      );
      res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ success: false, error: "email already exists" });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "invalid user id" });
    }

    try {
      const [[target]] = await proj.query("SELECT id, role FROM users WHERE id = ? LIMIT 1", [id]);
      if (!target) return res.status(404).json({ success: false, error: "user not found" });

      const { display_name, role, password } = req.body || {};
      if (target.role === "owner") {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }
      if (role && !["viewer", "admin", "owner"].includes(role)) {
        return res.status(400).json({ success: false, error: "invalid role" });
      }
      if (role === "owner" && req.session.role !== "owner") {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      if (password) {
        const hash = await bcrypt.hash(password, 10);
        await proj.query(
          "UPDATE users SET display_name = COALESCE(?, display_name), role = COALESCE(?, role), password_hash = ? WHERE id = ?",
          [display_name ?? null, role ?? null, hash, id]
        );
      } else {
        await proj.query(
          "UPDATE users SET display_name = COALESCE(?, display_name), role = COALESCE(?, role) WHERE id = ?",
          [display_name ?? null, role ?? null, id]
        );
      }

      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "invalid user id" });
    }

    try {
      const [[target]] = await proj.query("SELECT id, role FROM users WHERE id = ? LIMIT 1", [id]);
      if (!target) return res.status(404).json({ success: false, error: "user not found" });
      if (target.role === "owner") {
        return res.status(403).json({
          success: false,
          error: "Owner account cannot be deleted",
        });
      }

      await proj.query("DELETE FROM users WHERE id = ?", [id]);
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/api/users/:id/sections", requireAuth, requireRole("owner"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "invalid user id" });
    }

    const sections = Array.isArray(req.body?.sections) ? [...new Set(req.body.sections)] : null;
    if (!sections) {
      return res.status(400).json({ success: false, error: "sections must be an array" });
    }
    if (sections.some((section) => !allowedSections.has(section))) {
      return res.status(400).json({ success: false, error: "invalid section" });
    }

    try {
      const [[target]] = await proj.query("SELECT id, role FROM users WHERE id = ? LIMIT 1", [id]);
      if (!target) return res.status(404).json({ success: false, error: "user not found" });
      if (target.role !== "admin") {
        return res.status(400).json({ success: false, error: "sections can only be assigned to analysts" });
      }

      await proj.query("DELETE FROM user_section_access WHERE user_id = ?", [id]);
      if (sections.length) {
        const values = sections.map((section) => [id, section]);
        await proj.query("INSERT INTO user_section_access (user_id, section_key) VALUES ?", [values]);
      }

      res.status(200).json({ success: true, data: { user_id: id, sections } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = createAdminRouter;
