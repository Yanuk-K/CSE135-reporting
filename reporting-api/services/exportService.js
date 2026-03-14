const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const exportsDir = path.join(__dirname, "..", "exports");
const MIN_READABLE_SCALE = 0.75;

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

function renderScreenshotToCurrentPage(doc, screenshot) {
  const imageBuffer = decodeDataUrl(screenshot?.data_url);
  if (!imageBuffer) return false;

  const image = doc.openImage(imageBuffer);
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const top = doc.page.margins.top;
  const bottom = doc.page.margins.bottom;
  const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  let availableHeight = doc.page.height - doc.y - bottom;
  if (availableHeight < 120) {
    doc.addPage();
    availableHeight = doc.page.height - doc.y - bottom;
  }

  const widthScale = maxWidth / image.width;
  const heightScale = availableHeight / image.height;
  const fitScale = Math.min(widthScale, heightScale, 1);

  if (fitScale >= MIN_READABLE_SCALE) {
    const renderWidth = image.width * fitScale;
    const renderHeight = image.height * fitScale;
    const x = left + (maxWidth - renderWidth) / 2;

    doc.image(imageBuffer, x, doc.y, { width: renderWidth, height: renderHeight });
    doc.y += renderHeight + 10;
    return true;
  }

  const renderScale = Math.min(widthScale, 1);
  const renderWidth = image.width * renderScale;
  const renderHeight = image.height * renderScale;
  const x = left + (maxWidth - renderWidth) / 2;

  let offset = 0;
  let lastBottom = doc.y;

  while (offset < renderHeight) {
    const currentY = offset === 0 ? doc.y : top;
    let visibleHeight = doc.page.height - currentY - bottom;
    if (visibleHeight < 60) {
      doc.addPage();
      continue;
    }

    const remaining = renderHeight - offset;
    const drawHeight = Math.min(remaining, visibleHeight);

    doc.save();
    doc.rect(left, currentY, doc.page.width - left - right, drawHeight).clip();
    doc.image(imageBuffer, x, currentY - offset, { width: renderWidth, height: renderHeight });
    doc.restore();

    lastBottom = currentY + drawHeight;
    offset += drawHeight;

    if (offset < renderHeight) {
      doc.addPage();
    }
  }

  doc.y = Math.min(lastBottom + 10, doc.page.height - bottom);

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

  if (!Array.isArray(screenshots) || !screenshots.length) {
    doc.font("Helvetica").fontSize(11).text("No dashboard screenshot was available for this export.");
  } else {
    screenshots.forEach((screenshot) => {
      const rendered = renderScreenshotToCurrentPage(doc, screenshot);
      if (!rendered) {
        doc.font("Helvetica").fontSize(11).text("This section could not be rendered.");
      }
    });
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
