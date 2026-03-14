window.Dashboard = window.Dashboard || {};

Dashboard.renderSavedComments = function (container, reportJson) {
  const comments = (Array.isArray(reportJson?.blocks) ? reportJson.blocks : [])
    .map((block) => String(block?.comment || "").trim())
    .filter(Boolean);
  if (!comments.length) return;

  const panel = document.createElement("section");
  panel.className = "panel analyst-comment";
  const title = document.createElement("h3");
  title.textContent = "Analyst Comments";
  panel.appendChild(title);

  comments.forEach((comment) => {
    const p = document.createElement("p");
    p.textContent = comment;
    panel.appendChild(p);
  });

  container.appendChild(panel);
};

Dashboard.renderSavedCards = function (container, cards) {
  if (!Array.isArray(cards) || !cards.length) return;

  const panel = document.createElement("section");
  panel.className = "panel";
  const grid = document.createElement("div");
  grid.className = "cards-grid";

  cards.forEach((card) => {
    const metricCard = document.createElement("div");
    metricCard.className = "metric-card";
    const label = document.createElement("div");
    label.className = "metric-label";
    label.textContent = card?.label || "";
    const value = document.createElement("div");
    value.className = "metric-value";
    value.textContent = card?.value == null ? "n/a" : String(card.value);
    metricCard.appendChild(label);
    metricCard.appendChild(value);
    grid.appendChild(metricCard);
  });

  panel.appendChild(grid);
  container.appendChild(panel);
};

Dashboard.renderSavedTable = function (container, tableData) {
  if (!tableData || !Array.isArray(tableData.columns) || !Array.isArray(tableData.rows)) return;

  const panel = document.createElement("section");
  panel.className = "panel";
  const title = document.createElement("h3");
  title.textContent = tableData.title || "Data Table";
  panel.appendChild(title);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  tableData.columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = String(column);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  tableData.rows.forEach((row) => {
    const tr = document.createElement("tr");
    (row || []).forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell == null ? "" : String(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  panel.appendChild(table);
  container.appendChild(panel);
};

Dashboard.renderSavedChart = function (container, chartData, index) {
  if (!chartData || !Array.isArray(chartData.labels) || !Array.isArray(chartData.series)) return;

  const panel = document.createElement("section");
  panel.className = "panel";
  const title = document.createElement("h3");
  title.textContent = chartData.title || chartData.id || `Chart ${index + 1}`;
  const canvas = document.createElement("canvas");
  panel.appendChild(title);
  panel.appendChild(canvas);
  container.appendChild(panel);

  const palette = ["#2E86C1", "#60a5fa", "#94a3b8", "#64748b"];
  const chartType = chartData.type === "bar" ? "bar" : "line";
  new Chart(canvas, {
    type: chartType,
    data: {
      labels: chartData.labels,
      datasets: chartData.series.map((series, seriesIndex) => ({
        label: series?.label || `Series ${seriesIndex + 1}`,
        data: Array.isArray(series?.values) ? series.values : [],
        borderColor: palette[seriesIndex % palette.length],
        backgroundColor: palette[seriesIndex % palette.length],
        fill: false,
        borderWidth: 2,
        tension: 0.2,
      })),
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });
};

Dashboard.renderSavedSnapshot = function (container, snapshot) {
  if (!snapshot || !snapshot.section) {
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.textContent = "Legacy report: interactive snapshot unavailable.";
    container.appendChild(panel);
    return;
  }

  Dashboard.renderSavedCards(container, snapshot.cards || []);
  (snapshot.charts || []).forEach((chartData, index) => {
    Dashboard.renderSavedChart(container, chartData, index);
  });
  (snapshot.tables || []).forEach((tableData) => {
    Dashboard.renderSavedTable(container, tableData);
  });
};

Dashboard.renderSavedPublishedSection = async function (section) {
  const content = document.getElementById("content");
  Dashboard.showLoading(content);
  const role = Dashboard.getRole();

  try {
    const latest = await Dashboard.apiFetch(`/api/reports/latest/${section}`);
    const report = latest && latest.data;

    if (!report) {
      content.innerHTML = `
        <section class="panel">
          <h2>${section.toUpperCase()} Published Report</h2>
          <p>No published report is available for this section yet.</p>
        </section>
      `;
      return true;
    }

    content.innerHTML = `
      <section class="panel">
        <h2>${report.title || `${section.toUpperCase()} Published Report`}</h2>
        <p>Published at ${report.updated_at || report.created_at || "-"}</p>
        <button id="download-saved-pdf-btn" type="button">Download PDF</button>
      </section>
      <div id="saved-report-blocks"></div>
    `;

    const blocksContainer = document.getElementById("saved-report-blocks");
    Dashboard.renderSavedSnapshot(blocksContainer, report.report_json?.snapshot || null);
    Dashboard.renderSavedComments(blocksContainer, report.report_json);

    const downloadBtn = document.getElementById("download-saved-pdf-btn");
    downloadBtn.addEventListener("click", async () => {
      try {
        const response = await Dashboard.apiFetch(`/api/reports/${report.id}/pdf`);
        if (response?.data?.url) {
          window.open(response.data.url, "_blank", "noopener");
        }
      } catch (error) {
        Dashboard.showError(content, error.message);
      }
    });

    return true;
  } catch (error) {
    if (role === "viewer") {
      Dashboard.showError(content, error.message);
      return true;
    }
    return false;
  }
};
