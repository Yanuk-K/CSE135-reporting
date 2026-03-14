const { proj } = require("../db");
const { percentile } = require("../utils/request");

async function getDashboardSummary(start, end) {
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

  return {
    total_pageviews: Number(pageviewsRow.total_pageviews || 0),
    total_sessions: Number(sessionsRow.total_sessions || 0),
    average_load_time: perfRow.average_load_time == null ? null : Number(perfRow.average_load_time),
    total_errors: Number(errorsRow.total_errors || 0),
  };
}

async function getPageviewsReport(start, end, group, limit, offset) {
  const groupExpr =
    group === "hour"
      ? "DATE_FORMAT(server_timestamp, '%Y-%m-%d %H:00:00')"
      : "DATE(server_timestamp)";

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

  return {
    data: {
      timeseries,
      top_pages: topPages,
    },
    meta: {
      total: Number(countRow.total || 0),
      limit,
    },
  };
}

async function getPerformanceReport(start, end) {
  const [rows] = await proj.query(
    `SELECT lcp, cls, inp, load_time
     FROM performance
     WHERE server_timestamp >= ? AND server_timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
    [start, end]
  );

  const lcpVals = rows.map((row) => row.lcp).filter((value) => value != null).sort((a, b) => a - b);
  const clsVals = rows.map((row) => row.cls).filter((value) => value != null).sort((a, b) => a - b);
  const inpVals = rows.map((row) => row.inp).filter((value) => value != null).sort((a, b) => a - b);
  const loadVals = rows.map((row) => row.load_time).filter((value) => value != null).sort((a, b) => a - b);

  return {
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
  };
}

async function getErrorsReport(start, end, group, limit, offset) {
  const groupExpr =
    group === "hour"
      ? "DATE_FORMAT(server_timestamp, '%Y-%m-%d %H:00:00')"
      : "DATE(server_timestamp)";

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

  return {
    data: {
      timeseries,
      top_errors: topErrors,
    },
    meta: {
      total: Number(countRow.total || 0),
      limit,
    },
  };
}

async function getSessionsReport(start, end) {
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

  const [timeseries] = await proj.query(
    `SELECT DATE(start_time) AS date, COUNT(*) AS sessions
     FROM sessions
     WHERE start_time >= ? AND start_time < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY DATE(start_time)
     ORDER BY DATE(start_time) ASC`,
    [start, end]
  );

  const [depthBuckets] = await proj.query(
    `SELECT
       CASE
         WHEN page_count <= 1 THEN '1 page'
         WHEN page_count = 2 THEN '2 pages'
         WHEN page_count BETWEEN 3 AND 4 THEN '3-4 pages'
         ELSE '5+ pages'
       END AS bucket,
       COUNT(*) AS sessions
     FROM sessions
     WHERE start_time >= ? AND start_time < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY bucket
     ORDER BY FIELD(bucket, '1 page', '2 pages', '3-4 pages', '5+ pages')`,
    [start, end]
  );

  const [durationBuckets] = await proj.query(
    `SELECT
       CASE
         WHEN duration_seconds < 30 THEN '<30s'
         WHEN duration_seconds < 120 THEN '30s-2m'
         WHEN duration_seconds < 300 THEN '2m-5m'
         ELSE '5m+'
       END AS bucket,
       COUNT(*) AS sessions
     FROM sessions
     WHERE start_time >= ? AND start_time < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY bucket
     ORDER BY FIELD(bucket, '<30s', '30s-2m', '2m-5m', '5m+')`,
    [start, end]
  );

  return {
    summary: {
      total_sessions: Number(row.total_sessions || 0),
      avg_duration_seconds: row.avg_duration_seconds == null ? null : Number(row.avg_duration_seconds),
      avg_pages_per_session:
        row.avg_pages_per_session == null ? null : Number(row.avg_pages_per_session),
      bounce_rate: row.bounce_rate == null ? null : Number(row.bounce_rate),
    },
    timeseries,
    depth_buckets: depthBuckets,
    duration_buckets: durationBuckets,
  };
}

async function getOverviewReport(start, end) {
  const summary = await getDashboardSummary(start, end);
  const report = await getPageviewsReport(start, end, "day", 10, 0);
  return {
    summary,
    timeseries: report.data.timeseries,
    top_pages: report.data.top_pages,
  };
}

module.exports = {
  getDashboardSummary,
  getErrorsReport,
  getOverviewReport,
  getPageviewsReport,
  getPerformanceReport,
  getSessionsReport,
};
