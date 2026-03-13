const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const exportsDir = path.join(__dirname, "..", "exports");

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

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

function renderScreenshotAcrossPages(doc, screenshot) {
  const imageBuffer = decodeDataUrl(screenshot?.data_url);
  if (!imageBuffer) return false;

  const image = doc.openImage(imageBuffer);
  const left = doc.page.margins.left;
  const top = doc.y;
  const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const firstPageHeight = doc.page.height - top - doc.page.margins.bottom;
  const fullPageTop = doc.page.margins.top;
  const fullPageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const scale = maxWidth / image.width;
  const scaledHeight = image.height * scale;

  let offset = 0;
  let pageIndex = 0;

  while (offset < scaledHeight) {
    const currentTop = pageIndex === 0 ? top : fullPageTop;
    const visibleHeight = pageIndex === 0 ? firstPageHeight : fullPageHeight;

    if (pageIndex > 0) doc.addPage();
    doc.save();
    doc.rect(left, currentTop, maxWidth, visibleHeight).clip();
    doc.image(imageBuffer, left, currentTop - offset, { width: maxWidth });
    doc.restore();

    offset += visibleHeight;
    pageIndex += 1;
  }

  return true;
}

async function createExportPdf(route, start, end, screenshots = []) {
  await cleanupOldExports();

  const reportName = route.replace("/", "") || "report";
  const fileName = `${reportName}-${Date.now()}.pdf`;
  const filePath = path.join(exportsDir, fileName);
  const doc = new PDFDocument({ margin: 48, size: "LETTER" });
  const stream = fs.createWriteStream(filePath);

  doc.pipe(stream);
  doc.font("Helvetica-Bold").fontSize(20).text(`${reportName.toUpperCase()} Report`);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11).text(`Range: ${start} to ${end}`);
  doc.moveDown();

  const rendered = renderScreenshotAcrossPages(doc, screenshots[0]);
  if (!rendered) {
    doc.font("Helvetica").fontSize(11).text("No dashboard screenshot was available for this export.");
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
