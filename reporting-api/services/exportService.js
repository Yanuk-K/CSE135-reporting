const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const {
  getErrorsReport,
  getOverviewReport,
  getPerformanceReport,
} = require("./reportData");

const exportsDir = path.join(__dirname, "..", "exports");

function formatDate(value) {
  return value == null ? "-" : new Date(value).toISOString().slice(0, 10);
}

function formatNumber(value, digits = 0, suffix = "") {
  if (value == null) return "n/a";
  return `${Number(value).toFixed(digits)}${suffix}`;
}

async function cleanupOldExports() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  try {
    const entries = await fs.promises.readdir(exportsDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".pdf"))
        .map(async (entry) => {
          const filePath = path.join(exportsDir, entry.name);
          const stat = await fs.promises.stat(filePath);
          if (stat.mtimeMs < cutoff) {
            await fs.promises.unlink(filePath);
          }
        })
    );
  } catch (_) {
  }
}

function writeRows(doc, rows) {
  rows.forEach((row) => {
    if (doc.y > 720) doc.addPage();
    doc.font("Helvetica").fontSize(11).text(row);
  });
}

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

function writeChartImages(doc, chartImages) {
  if (!Array.isArray(chartImages) || chartImages.length === 0) return;

  chartImages.forEach((chart) => {
    const imageBuffer = decodeDataUrl(chart.data_url);
    if (!imageBuffer) return;

    if (doc.y > 500) doc.addPage();
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(13).text(chart.label || "Chart");
    doc.moveDown(0.4);
    doc.image(imageBuffer, {
      fit: [500, 260],
      align: "center",
      valign: "center",
    });
    doc.moveDown();
  });
}

function buildOverviewPdf(doc, start, end, data, chartImages) {
  doc.font("Helvetica-Bold").fontSize(20).text("Overview Report");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11).text(`Range: ${start} to ${end}`);
  doc.moveDown();
  writeChartImages(doc, chartImages);
  writeRows(doc, [
    `Total Pageviews: ${data.summary.total_pageviews.toLocaleString()}`,
    `Total Sessions: ${data.summary.total_sessions.toLocaleString()}`,
    `Avg Load Time: ${formatNumber(data.summary.average_load_time, 2, " ms")}`,
    `Total Errors: ${data.summary.total_errors.toLocaleString()}`,
    "",
    "Top Pages",
    ...(data.top_pages.length
      ? data.top_pages.map(
          (row, index) =>
            `${index + 1}. ${row.url || "/"} (${Number(row.views || 0).toLocaleString()} views)`
        )
      : ["No pageviews found in this range."]),
    "",
    "Pageviews by Day",
    ...(data.timeseries.length
      ? data.timeseries.map(
          (row) => `${formatDate(row.date)}: ${Number(row.views || 0).toLocaleString()}`
        )
      : ["No pageview trend data found in this range."]),
  ]);
}

function buildPerformancePdf(doc, start, end, data, chartImages) {
  doc.font("Helvetica-Bold").fontSize(20).text("Performance Report");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11).text(`Range: ${start} to ${end}`);
  doc.moveDown();
  writeChartImages(doc, chartImages);
  writeRows(
    doc,
    Object.entries(data).flatMap(([metric, value]) => [
      metric.toUpperCase(),
      `  p50: ${metric === "cls" ? formatNumber(value.p50, 3) : formatNumber(value.p50, 2, " ms")}`,
      `  p75: ${metric === "cls" ? formatNumber(value.p75, 3) : formatNumber(value.p75, 2, " ms")}`,
      `  p95: ${metric === "cls" ? formatNumber(value.p95, 3) : formatNumber(value.p95, 2, " ms")}`,
      "",
    ])
  );
}

function buildErrorsPdf(doc, start, end, data, chartImages) {
  const totalErrors = data.timeseries.reduce((sum, row) => sum + Number(row.errors || 0), 0);

  doc.font("Helvetica-Bold").fontSize(20).text("Errors Report");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11).text(`Range: ${start} to ${end}`);
  doc.moveDown();
  writeChartImages(doc, chartImages);
  writeRows(doc, [
    `Total Errors: ${totalErrors.toLocaleString()}`,
    "",
    "Top Errors",
    ...(data.top_errors.length
      ? data.top_errors.map(
          (row, index) =>
            `${index + 1}. ${row.error_message} (${Number(row.hits || 0).toLocaleString()} hits)`
        )
      : ["No errors found in this range."]),
    "",
    "Errors by Day",
    ...(data.timeseries.length
      ? data.timeseries.map(
          (row) => `${formatDate(row.date)}: ${Number(row.errors || 0).toLocaleString()}`
        )
      : ["No error trend data found in this range."]),
  ]);
}

async function createExportPdf(route, start, end, chartImages = []) {
  await cleanupOldExports();

  const reportName = route.replace("/", "") || "report";
  const fileName = `${reportName}-${Date.now()}.pdf`;
  const filePath = path.join(exportsDir, fileName);
  const doc = new PDFDocument({ margin: 48, size: "LETTER" });
  const stream = fs.createWriteStream(filePath);

  let data;
  if (route === "/overview") {
    data = await getOverviewReport(start, end);
  } else if (route === "/performance") {
    data = await getPerformanceReport(start, end);
  } else {
    const report = await getErrorsReport(start, end, "day", 10, 0);
    data = report.data;
  }

  doc.pipe(stream);
  if (route === "/overview") {
    buildOverviewPdf(doc, start, end, data, chartImages);
  } else if (route === "/performance") {
    buildPerformancePdf(doc, start, end, data, chartImages);
  } else {
    buildErrorsPdf(doc, start, end, data, chartImages);
  }
  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return fileName;
}

module.exports = {
  createExportPdf,
};
