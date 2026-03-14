const express = require("express");
const fs = require("fs");
const path = require("path");
const { proj } = require("../db");
const { createExportPdf } = require("../services/exportService");

const allowedSections = new Set(["overview", "sessions", "performance", "errors"]);
const allowedCategories = new Set(["traffic", "behavior", "performance"]);
const exportsDir = path.join(__dirname, "..", "exports");

function parseStoredJson(value) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

async function hasSectionAccess(userId, sectionKey) {
  const [rows] = await proj.query(
    "SELECT 1 FROM user_section_access WHERE user_id = ? AND section_key = ? LIMIT 1",
    [userId, sectionKey]
  );
  return rows.length > 0;
}

function normalizePublishValue(value) {
  if (value === undefined) return 1;
  return value ? 1 : 0;
}

function buildPdfUrl(req, reportId) {
  return `${req.protocol}://${req.get("host")}/api/exports/files/report-${Number(reportId)}.pdf`;
}

function canReadReport(role, userId, row) {
  if (role === "owner") return true;
  if (role === "admin") return Number(row.owner_user_id) === Number(userId);
  if (role === "viewer") return Number(row.is_published) === 1;
  return false;
}

function validateReportPayload(sectionKey, category, reportJson) {
  if (!allowedCategories.has(String(category || ""))) {
    return "invalid category";
  }
  if (reportJson == null || typeof reportJson !== "object") {
    return "invalid report_json";
  }
  const snapshotSection = reportJson?.snapshot?.section;
  if (snapshotSection && snapshotSection !== sectionKey) {
    return "snapshot section does not match section_key";
  }
  return null;
}

async function createSavedReportPdf(report, screenshots) {
  const body = parseStoredJson(report?.report_json) || {};
  const start = body?.range?.start || "n/a";
  const end = body?.range?.end || "n/a";
  const route = `/${report.section_key}`;
  const tempFileName = await createExportPdf(route, start, end, screenshots);
  const fromPath = path.join(exportsDir, tempFileName);
  const targetFileName = `report-${Number(report.id)}.pdf`;
  const toPath = path.join(exportsDir, targetFileName);
  await fs.promises.rename(fromPath, toPath);
  return targetFileName;
}

function createReportsRouter({ requireAuth }) {
  const router = express.Router();

  router.post("/api/reports", requireAuth, async (req, res) => {
    try {
      const role = req.session?.role;
      const userId = req.session?.userId;
      if (!["owner", "admin"].includes(role) || !userId) {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      const { title, section_key, category, report_json, is_published } = req.body || {};
      const screenshots = Array.isArray(req.body?.screenshot_images) ? req.body.screenshot_images : [];
      if (!title || !section_key || !category || report_json == null) {
        return res.status(400).json({ success: false, error: "title, section_key, category, report_json are required" });
      }
      if (!screenshots.length) {
        return res.status(400).json({ success: false, error: "screenshot_images is required" });
      }
      if (!allowedSections.has(section_key)) {
        return res.status(400).json({ success: false, error: "invalid section" });
      }
      const reportValidationError = validateReportPayload(section_key, category, report_json);
      if (reportValidationError) {
        return res.status(400).json({ success: false, error: reportValidationError });
      }

      if (role === "admin") {
        const allowed = await hasSectionAccess(userId, section_key);
        if (!allowed) {
          return res.status(403).json({ success: false, error: "Insufficient permissions" });
        }
      }

      const [result] = await proj.query(
        `INSERT INTO saved_reports
         (owner_user_id, title, section_key, category, report_json, is_published)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, String(title), section_key, String(category), JSON.stringify(report_json), normalizePublishValue(is_published)]
      );

      const [[saved]] = await proj.query(
        "SELECT id, title, section_key, category, report_json FROM saved_reports WHERE id = ? LIMIT 1",
        [result.insertId]
      );
      await createSavedReportPdf(saved, screenshots);

      return res.status(201).json({
        success: true,
        data: {
          id: result.insertId,
          pdf_url: buildPdfUrl(req, result.insertId),
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/api/reports/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "invalid report id" });
    }

    try {
      const role = req.session?.role;
      const userId = req.session?.userId;
      const screenshots = Array.isArray(req.body?.screenshot_images) ? req.body.screenshot_images : [];
      const [[existing]] = await proj.query("SELECT * FROM saved_reports WHERE id = ? LIMIT 1", [id]);
      if (!existing) return res.status(404).json({ success: false, error: "report not found" });

      if (!screenshots.length) {
        return res.status(400).json({ success: false, error: "screenshot_images is required" });
      }

      if (role !== "owner" && !(role === "admin" && Number(existing.owner_user_id) === Number(userId))) {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      const nextTitle = req.body?.title ?? existing.title;
      const nextSection = req.body?.section_key ?? existing.section_key;
      const nextCategory = req.body?.category ?? existing.category;
      const nextReportJson = req.body?.report_json ?? parseStoredJson(existing.report_json);
      const nextPublished =
        req.body && Object.prototype.hasOwnProperty.call(req.body, "is_published")
          ? normalizePublishValue(req.body.is_published)
          : existing.is_published;

      if (!nextTitle || !nextSection || !nextCategory || nextReportJson == null) {
        return res.status(400).json({ success: false, error: "title, section_key, category, report_json are required" });
      }
      if (!allowedSections.has(nextSection)) {
        return res.status(400).json({ success: false, error: "invalid section" });
      }
      const reportValidationError = validateReportPayload(nextSection, nextCategory, nextReportJson);
      if (reportValidationError) {
        return res.status(400).json({ success: false, error: reportValidationError });
      }

      if (role === "admin") {
        const allowed = await hasSectionAccess(userId, nextSection);
        if (!allowed) {
          return res.status(403).json({ success: false, error: "Insufficient permissions" });
        }
      }

      await proj.query(
        `UPDATE saved_reports
         SET title = ?, section_key = ?, category = ?, report_json = ?, is_published = ?
         WHERE id = ?`,
        [
          String(nextTitle),
          nextSection,
          String(nextCategory),
          JSON.stringify(nextReportJson),
          nextPublished,
          id,
        ]
      );

      const [[saved]] = await proj.query(
        "SELECT id, title, section_key, category, report_json FROM saved_reports WHERE id = ? LIMIT 1",
        [id]
      );
      await createSavedReportPdf(saved, screenshots);

      return res.status(200).json({
        success: true,
        data: {
          id,
          pdf_url: buildPdfUrl(req, id),
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/reports", requireAuth, async (req, res) => {
    try {
      const role = req.session?.role;
      const userId = req.session?.userId;
      let query = "SELECT id, owner_user_id, title, section_key, category, report_json, is_published, created_at, updated_at FROM saved_reports";
      const params = [];

      if (role === "admin") {
        query += " WHERE owner_user_id = ?";
        params.push(userId);
      } else if (role === "viewer") {
        query += " WHERE is_published = 1";
      } else if (role !== "owner") {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      query += " ORDER BY id DESC";
      const [rows] = await proj.query(query, params);
      const data = rows.map((row) => ({
        ...row,
        report_json: parseStoredJson(row.report_json),
        pdf_url: buildPdfUrl(req, row.id),
      }));
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/reports/latest/:section_key", requireAuth, async (req, res) => {
    const sectionKey = String(req.params.section_key || "");
    if (!allowedSections.has(sectionKey)) {
      return res.status(400).json({ success: false, error: "invalid section" });
    }

    try {
      const [[row]] = await proj.query(
        `SELECT id, owner_user_id, title, section_key, category, report_json, is_published, created_at, updated_at
         FROM saved_reports
         WHERE section_key = ? AND is_published = 1
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        [sectionKey]
      );

      if (!row) {
        return res.status(200).json({ success: true, data: null });
      }

      return res.status(200).json({
        success: true,
        data: {
          ...row,
          report_json: parseStoredJson(row.report_json),
          pdf_url: buildPdfUrl(req, row.id),
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/reports/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "invalid report id" });
    }

    try {
      const role = req.session?.role;
      const userId = req.session?.userId;
      const [[row]] = await proj.query(
        "SELECT id, owner_user_id, title, section_key, category, report_json, is_published, created_at, updated_at FROM saved_reports WHERE id = ? LIMIT 1",
        [id]
      );
      if (!row) return res.status(404).json({ success: false, error: "report not found" });

      if (!canReadReport(role, userId, row)) {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      return res.status(200).json({
        success: true,
        data: {
          ...row,
          report_json: parseStoredJson(row.report_json),
          pdf_url: buildPdfUrl(req, row.id),
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/reports/:id/pdf", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "invalid report id" });
    }

    try {
      const role = req.session?.role;
      const userId = req.session?.userId;
      const [[row]] = await proj.query(
        "SELECT id, owner_user_id, is_published FROM saved_reports WHERE id = ? LIMIT 1",
        [id]
      );
      if (!row) return res.status(404).json({ success: false, error: "report not found" });
      if (!canReadReport(role, userId, row)) {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      return res.status(200).json({
        success: true,
        data: {
          url: buildPdfUrl(req, id),
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/api/reports/:id/publish", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "invalid report id" });
    }

    try {
      const role = req.session?.role;
      const userId = req.session?.userId;
      if (!["owner", "admin"].includes(role) || !userId) {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      const [[existing]] = await proj.query(
        "SELECT id, owner_user_id FROM saved_reports WHERE id = ? LIMIT 1",
        [id]
      );
      if (!existing) return res.status(404).json({ success: false, error: "report not found" });
      if (role === "admin" && Number(existing.owner_user_id) !== Number(userId)) {
        return res.status(403).json({ success: false, error: "Insufficient permissions" });
      }

      const isPublished = normalizePublishValue(req.body?.is_published);
      await proj.query("UPDATE saved_reports SET is_published = ? WHERE id = ?", [isPublished, id]);
      return res.status(200).json({ success: true, data: { id, is_published: isPublished } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = createReportsRouter;
