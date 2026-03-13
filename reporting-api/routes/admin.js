const express = require("express");
const bcrypt = require("bcrypt");
const { proj } = require("../db");

function createAdminRouter({ requireAuth, requireRole }) {
  const router = express.Router();

  router.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const [rows] = await proj.query(
        "SELECT id, email, display_name, role, created_at, last_login FROM users ORDER BY id DESC"
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

  return router;
}

module.exports = createAdminRouter;
