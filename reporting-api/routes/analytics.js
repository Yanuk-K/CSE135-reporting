const express = require("express");

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

  router.get("/api/pageviews", requireAuth, async (req, res) => {
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

  router.get("/api/performance", requireAuth, async (req, res) => {
    const range = parseDateRange(req, res);
    if (!range) return;

    try {
      const data = await getPerformanceReport(range.start, range.end);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/errors", requireAuth, async (req, res) => {
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

  router.get("/api/sessions", requireAuth, async (req, res) => {
    const range = parseDateRange(req, res);
    if (!range) return;

    try {
      const data = await getSessionsReport(range.start, range.end);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/api/overview", requireAuth, async (req, res) => {
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
    if (!["/overview", "/performance", "/errors"].includes(route)) {
      return res.status(400).json({ success: false, error: "Unsupported report route" });
    }

    const range = normalizeDateRange(req.body?.start, req.body?.end);
    if (!range.ok) {
      return res.status(400).json({ success: false, error: range.error });
    }

    try {
      const fileName = await createExportPdf(
        route,
        range.data.start,
        range.data.end,
        Array.isArray(req.body?.chart_images) ? req.body.chart_images : []
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
