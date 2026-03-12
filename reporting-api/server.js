const express = require("express");
const cors = require("cors");
const { proj } = require("./db");
const session = require("express-session");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const app = express();
app.use(cors());
app.use(express.json());

// Rate limiting via express-rate-limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 requests per IP per window
  message: {
    success: false,
    error: "Too many requests. Try again in a minute."
  }
});
app.use("/api", apiLimiter);

// Session-based authentication
app.set("trust proxy", 1);
app.use(
  session({
    secret: "very-long-random-secret-1q2w3e4r!",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// Swagger API docs
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const swaggerDocument = YAML.load(path.join(__dirname, "openapi.yaml"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// GET: Retrieve every entry logged in pageviews table via static API
app.get("/api/static", async (req, res) => {
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
// GET: Retrieve list of user agents
app.get("/api/static/useragents", async (req, res) => {
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
// GET: Retrieve list of languages
app.get("/api/static/languages", async (req, res) => {
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
// GET: Retrieve list of screensizes
app.get("/api/static/screensizes", async (req, res) => {
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
// GET: Retrieve a specific static entry by id from pageviews table
app.get("/api/static/:id", async (req, res) => {
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
// POST: Add a new static entry into pageviews table
app.post("/api/static", async (req, res) => {
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
    const sessionId = session_id || `api-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
        sessionId,
        payloadJson,
        created_at ?? null,
      ]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// PUT: Update a specific static entry by id in pageviews table
app.put("/api/static/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "id must be a positive integer" });
  }
  const { user_agent, language, screen_width, screen_height, server_timestamp, created_at } = req.body;
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
// DELETE: Delete a specific static entry by id from pageviews table
app.delete("/api/static/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "id must be a positive integer" });
  }
  try {
    const [result] = await proj.query(`DELETE FROM pageviews WHERE id = ?`, [id]);
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    res.status(200).json({ ok: true, deleted: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET: Retrieve every activity event
app.get("/api/activity", async (req, res) => {
  try {
    const [rows] = await proj.query("SELECT * FROM events ORDER BY id DESC");
    res.status(200).json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// GET: Retrieve grouped activity event names
app.get("/api/activity/names", async (req, res) => {
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
// GET: Retrieve grouped activity categories
app.get("/api/activity/categories", async (req, res) => {
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
// GET: Retrieve grouped activity URLs
app.get("/api/activity/urls", async (req, res) => {
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
// GET: Retrieve one activity event by id
app.get("/api/activity/:id", async (req, res) => {
  try {
    const [rows] = await proj.query("SELECT * FROM events WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "Not found" });
    res.status(200).json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// POST: Add one activity event
app.post("/api/activity", async (req, res) => {
  const {
    session_id,
    event_name,
    event_category,
    event_data,
    url,
    server_timestamp,
    created_at,
  } = req.body || {};
  try {
    const payload = event_data && typeof event_data === "object" ? JSON.stringify(event_data) : event_data ?? null;
    const generatedSessionId = session_id || `api-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
// PUT: Update one activity event by id
app.put("/api/activity/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "id must be a positive integer" });
  }
  const {
    session_id,
    event_name,
    event_category,
    event_data,
    url,
    server_timestamp,
    created_at,
  } = req.body || {};
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
// DELETE: Delete one activity event by id
app.delete("/api/activity/:id", async (req, res) => {
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

// Middleware: require authentication
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  next();
}

// Middleware: require a minimum role level
function requireRole(minRole) {
  const hierarchy = { viewer: 1, admin: 2, owner: 3 };

  return (req, res, next) => {
    const userRole = req.session.role;
    if (hierarchy[userRole] < hierarchy[minRole]) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }
    next();
  };
}


// Parsing date in place of manually partitioning db
function parseDateRange(req, res) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const now = new Date();
  const endDefault = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 30);
  const startDefault = startDate.toISOString().slice(0, 10);
  const start = req.query.start || startDefault;
  const end = req.query.end || endDefault;
  if (!re.test(start) || !re.test(end)) {
    res.status(400).json({ success: false, error: "Invalid date format: use YYYY-MM-DD" });
    return null;
  }
  if (start > end) {
    res.status(400).json({ success: false, error: "Invalid date range: start must be before end" });
    return null;
  }
  return { start, end };
}
function parsePaging(req) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
function parseGroup(req) {
  return req.query.group === "hour" ? "hour" : "day";
}
// For performance
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

app.post("/api/login", async (req, res) => {
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
app.post("/api/logout", (req, res) => {
  if (!req.session) {
    return res.status(200).json({ success: true });
  }
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    return res.status(200).json({ success: true });
  });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const { start, end } = range;
  try {
    const [[pageviewsRow]] = await proj.query(
      `SELECT COUNT(*) AS total_pageviews
       FROM pageviews
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    const [[sessionsRow]] = await proj.query(
      `SELECT COUNT(*) AS total_sessions
       FROM sessions
       WHERE start_time >= ? AND start_time < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    const [[perfRow]] = await proj.query(
      `SELECT AVG(load_time) AS average_load_time
       FROM performance
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    const [[errorsRow]] = await proj.query(
      `SELECT COUNT(*) AS total_errors
       FROM errors
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    return res.status(200).json({
      success: true,
      data: {
        total_pageviews: Number(pageviewsRow.total_pageviews || 0),
        total_sessions: Number(sessionsRow.total_sessions || 0),
        average_load_time:
          perfRow.average_load_time == null ? null : Number(perfRow.average_load_time),
        total_errors: Number(errorsRow.total_errors || 0),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/pageviews", requireAuth, async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const { start, end } = range;
  const group = parseGroup(req);
  const { page, limit, offset } = parsePaging(req);
  const groupExpr =
    group === "hour"
      ? "DATE_FORMAT(server_timestamp, '%Y-%m-%d %H:00:00')"
      : "DATE(server_timestamp)";
  try {
    const [timeseries] = await proj.query(
      `SELECT ${groupExpr} AS date, COUNT(*) AS views
       FROM pageviews
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY date
       ORDER BY date ASC`,
      [start, end]
    );
    const [topPages] = await proj.query(
      `SELECT url, COUNT(*) AS views
       FROM pageviews
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY url
       ORDER BY views DESC
       LIMIT ? OFFSET ?`,
      [start, end, limit, offset]
    );
    const [[countRow]] = await proj.query(
      `SELECT COUNT(DISTINCT url) AS total
       FROM pageviews
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    return res.status(200).json({
      success: true,
      data: {
        timeseries,
        top_pages: topPages,
      },
      meta: {
        total: Number(countRow.total || 0),
        page,
        limit,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/performance", requireAuth, async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const { start, end } = range;
  try {
    const [rows] = await proj.query(
      `SELECT lcp, cls, inp, load_time
       FROM performance
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    const lcpVals = rows.map(r => r.lcp).filter(v => v != null).sort((a, b) => a - b);
    const clsVals = rows.map(r => r.cls).filter(v => v != null).sort((a, b) => a - b);
    const inpVals = rows.map(r => r.inp).filter(v => v != null).sort((a, b) => a - b);
    const loadVals = rows.map(r => r.load_time).filter(v => v != null).sort((a, b) => a - b);
    return res.status(200).json({
      success: true,
      data: {
        lcp: {
          p50: percentile(lcpVals, 50),
          p75: percentile(lcpVals, 75),
          p95: percentile(lcpVals, 95),
        },
        cls: {
          p50: percentile(clsVals, 50),
          p75: percentile(clsVals, 75),
          p95: percentile(clsVals, 95),
        },
        inp: {
          p50: percentile(inpVals, 50),
          p75: percentile(inpVals, 75),
          p95: percentile(inpVals, 95),
        },
        load_time: {
          p50: percentile(loadVals, 50),
          p75: percentile(loadVals, 75),
          p95: percentile(loadVals, 95),
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/errors", requireAuth, async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const { start, end } = range;
  const group = parseGroup(req);
  const { page, limit, offset } = parsePaging(req);
  const groupExpr =
    group === "hour"
      ? "DATE_FORMAT(server_timestamp, '%Y-%m-%d %H:00:00')"
      : "DATE(server_timestamp)";
  try {
    const [timeseries] = await proj.query(
      `SELECT ${groupExpr} AS date, COUNT(*) AS errors
       FROM errors
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY date
       ORDER BY date ASC`,
      [start, end]
    );
    const [topErrors] = await proj.query(
      `SELECT COALESCE(error_message, 'Unknown error') AS error_message, COUNT(*) AS hits
       FROM errors
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY error_message
       ORDER BY hits DESC
       LIMIT ? OFFSET ?`,
      [start, end, limit, offset]
    );
    const [[countRow]] = await proj.query(
      `SELECT COUNT(DISTINCT COALESCE(error_message, 'Unknown error')) AS total
       FROM errors
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    return res.status(200).json({
      success: true,
      data: {
        timeseries,
        top_errors: topErrors,
      },
      meta: {
        total: Number(countRow.total || 0),
        page,
        limit,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/sessions", requireAuth, async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const { start, end } = range;
  try {
    const [[row]] = await proj.query(
      `SELECT
         COUNT(*) AS total_sessions,
         AVG(duration_seconds) AS avg_duration_seconds,
         AVG(page_count) AS avg_pages_per_session,
         (SUM(CASE WHEN page_count = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100 AS bounce_rate
       FROM sessions
       WHERE start_time >= ? AND start_time < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    return res.status(200).json({
      success: true,
      data: {
        total_sessions: Number(row.total_sessions || 0),
        avg_duration_seconds:
          row.avg_duration_seconds == null ? null : Number(row.avg_duration_seconds),
        avg_pages_per_session:
          row.avg_pages_per_session == null ? null : Number(row.avg_pages_per_session),
        bounce_rate: row.bounce_rate == null ? null : Number(row.bounce_rate),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/overview", requireAuth, async (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const { start, end } = range;
  try {
    const [[pv]] = await proj.query(
      `SELECT COUNT(*) AS total_pageviews
       FROM pageviews
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    const [[ss]] = await proj.query(
      `SELECT COUNT(*) AS total_sessions
       FROM sessions
       WHERE start_time >= ? AND start_time < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    const [[pf]] = await proj.query(
      `SELECT AVG(load_time) AS average_load_time
       FROM performance
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    const [[er]] = await proj.query(
      `SELECT COUNT(*) AS total_errors
       FROM errors
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [start, end]
    );
    const [timeseries] = await proj.query(
      `SELECT DATE(server_timestamp) AS date, COUNT(*) AS views
       FROM pageviews
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY date
       ORDER BY date ASC`,
      [start, end]
    );
    const [topPages] = await proj.query(
      `SELECT url, COUNT(*) AS views
       FROM pageviews
       WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY url
       ORDER BY views DESC
       LIMIT 10`
      , [start, end]
    );
    res.status(200).json({
      success: true,
      data: {
        summary: {
          total_pageviews: Number(pv.total_pageviews || 0),
          total_sessions: Number(ss.total_sessions || 0),
          average_load_time: pf.average_load_time == null ? null : Number(pf.average_load_time),
          total_errors: Number(er.total_errors || 0),
        },
        timeseries,
        top_pages: topPages,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin API
// GET users (admin/owner)
app.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await proj.query(
      "SELECT id, email, display_name, role, created_at, last_login FROM users ORDER BY id DESC"
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// POST users (admin/owner) - create account
app.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { email, password, display_name, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "email and password are required" });
    }
    const newRole = role || "viewer";
    if (!["viewer", "admin", "owner"].includes(newRole)) {
      return res.status(400).json({ success: false, error: "invalid role" });
    }
    // only owner can create owner
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
// PUT users/:id (admin/owner) - update display_name/role/password
app.put("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: "invalid user id" });
  }
  try {
    const [[target]] = await proj.query("SELECT id, role FROM users WHERE id = ? LIMIT 1", [id]);
    if (!target) return res.status(404).json({ success: false, error: "user not found" });
    const { display_name, role, password } = req.body || {};
    // owner cannot be demoted
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
// DELETE users/:id (admin/owner)
app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: "invalid user id" });
  }
  try {
    const [[target]] = await proj.query("SELECT id, role FROM users WHERE id = ? LIMIT 1", [id]);
    if (!target) return res.status(404).json({ success: false, error: "user not found" });
    // owner cannot be deleted
    if (target.role === "owner") {
      return res.status(403).json({ success: false, error: "Owner account cannot be deleted" });
    }
    await proj.query("DELETE FROM users WHERE id = ?", [id]);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "127.0.0.1", () => {
  console.log(`API running on port ${port}`);
});
