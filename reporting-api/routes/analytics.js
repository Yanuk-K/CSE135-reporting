const express = require("express");
const { proj } = require("../db");

const { createExportPdf } = require("../services/exportService");
const {
  getDashboardSummary,
  getErrorsReport,
  getOverviewReport,
  getPageviewsReport,
  getPerformanceReport,
  getSessionsReport,
} = require("../services/reportData");
const { normalizeDateRange, parseDateRange, parseGroup, parsePaging } = require("../utils/request");

function createAnalyticsRouter({ requireAuth }) {
  const router = express.Router();

  const hasSectionAccess = async (userId, sectionKey) => {
    const [rows] = await proj.query(
      "SELECT 1 FROM user_section_access WHERE user_id = ? AND section_key = ? LIMIT 1",
      [userId, sectionKey]
    );
    return rows.length > 0;
  };

  const requireSectionAccess = (sectionKey) => {
    return async (req, res, next) => {
      try {
        if (req.session?.role === "owner") return next();
        if (req.session?.role !== "admin" || !req.session?.userId) {
          return res.status(403).json({ success: false, error: "Insufficient permissions" });
        }

        const allowed = await hasSectionAccess(req.session.userId, sectionKey);
        if (!allowed) {
          return res.status(403).json({ success: false, error: "Insufficient permissions" });
        }

        return next();
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    };
  };

  router.get("/api/dashboard", requireAuth, async (req, res) => {
    const range = parseDateRange(req, res);
    if (!range) return;

    try {
      const data = await getDashboardSummary(range.start, range.end);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/pageviews", requireAuth, requireSectionAccess("overview"), async (req, res) => {
    const range = parseDateRange(req, res);
    if (!range) return;

    const group = parseGroup(req);
    const { page, limit, offset } = parsePaging(req);

    try {
      const report = await getPageviewsReport(range.start, range.end, group, limit, offset);
      return res.status(200).json({
        success: true,
        data: report.data,
        meta: {
          ...report.meta,
          page,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/performance", requireAuth, requireSectionAccess("performance"), async (req, res) => {
    const range = parseDateRange(req, res);
    if (!range) return;

    try {
      const data = await getPerformanceReport(range.start, range.end);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/errors", requireAuth, requireSectionAccess("errors"), async (req, res) => {
    const range = parseDateRange(req, res);
    if (!range) return;

    const group = parseGroup(req);
    const { page, limit, offset } = parsePaging(req);

    try {
      const report = await getErrorsReport(range.start, range.end, group, limit, offset);
      return res.status(200).json({
        success: true,
        data: report.data,
        meta: {
          ...report.meta,
          page,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/sessions", requireAuth, requireSectionAccess("sessions"), async (req, res) => {
    const range = parseDateRange(req, res);
    if (!range) return;

    try {
      const data = await getSessionsReport(range.start, range.end);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/overview", requireAuth, requireSectionAccess("overview"), async (req, res) => {
    const range = parseDateRange(req, res);
    if (!range) return;

    try {
      const data = await getOverviewReport(range.start, range.end);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/api/exports/report", requireAuth, async (req, res) => {
    const route = req.body?.route;
    const routeToSection = {
      "/overview": "overview",
      "/sessions": "sessions",
      "/performance": "performance",
      "/errors": "errors",
    };
    if (!routeToSection[route]) {
      return res.status(400).json({ success: false, error: "Unsupported report route" });
    }

    const range = normalizeDateRange(req.body?.start, req.body?.end);
    if (!range.ok) {
      return res.status(400).json({ success: false, error: range.error });
    }

    try {
      const sectionKey = routeToSection[route];
      if (req.session?.role !== "owner") {
        if (req.session?.role !== "admin" || !req.session?.userId) {
          return res.status(403).json({ success: false, error: "Insufficient permissions" });
        }
        const allowed = await hasSectionAccess(req.session.userId, sectionKey);
        if (!allowed) {
          return res.status(403).json({ success: false, error: "Insufficient permissions" });
        }
      }

      const fileName = await createExportPdf(
        route,
        range.data.start,
        range.data.end,
        Array.isArray(req.body?.screenshot_images) ? req.body.screenshot_images : []
      );
      const filePath = `/api/exports/files/${fileName}`;
      const url = `${req.protocol}://${req.get("host")}${filePath}`;
      return res.status(201).json({
        success: true,
        data: {
          file_name: fileName,
          path: filePath,
          url,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = createAnalyticsRouter;
