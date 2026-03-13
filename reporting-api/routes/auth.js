const express = require("express");
const bcrypt = require("bcrypt");
const { proj } = require("../db");

function createAuthRouter() {
  const router = express.Router();

  router.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: "Email and password are required",
        });
      }

      const [rows] = await proj.query(
        "SELECT id, email, password_hash, role, display_name FROM users WHERE email = ? LIMIT 1",
        [email]
      );
      if (!rows.length) {
        return res.status(401).json({
          success: false,
          error: "Invalid credentials",
        });
      }

      const user = rows[0];
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return res.status(401).json({
          success: false,
          error: "Invalid credentials",
        });
      }

      req.session.userId = user.id;
      req.session.role = user.role;
      await proj.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          display_name: user.display_name,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/api/logout", (req, res) => {
    if (!req.session) {
      return res.status(200).json({ success: true });
    }

    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      return res.status(200).json({ success: true });
    });
  });

  return router;
}

module.exports = createAuthRouter;
