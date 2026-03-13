function parseDateRange(req, res) {
  const now = new Date();
  const endDefault = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 30);
  const range = normalizeDateRange(
    req.query.start || startDate.toISOString().slice(0, 10),
    req.query.end || endDefault
  );

  if (!range.ok) {
    res.status(400).json({ success: false, error: range.error });
    return null;
  }

  return range.data;
}

function normalizeDateRange(start, end) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(start) || !re.test(end)) {
    return { ok: false, error: "Invalid date format: use YYYY-MM-DD" };
  }
  if (start > end) {
    return { ok: false, error: "Invalid date range: start must be before end" };
  }
  return { ok: true, data: { start, end } };
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

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

module.exports = {
  normalizeDateRange,
  parseDateRange,
  parseGroup,
  parsePaging,
  percentile,
};
