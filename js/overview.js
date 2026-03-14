window.Dashboard = window.Dashboard || {};

Dashboard.getDateRange = function () {
  const end = document.getElementById("end-date")?.value || Dashboard.defaultEnd();
  const start = document.getElementById("start-date")?.value || Dashboard.defaultStart();
  return { start, end };
};

Dashboard.renderCards = function (data) {
  const container = document.getElementById("cards");
  if (!container) return;
  container.innerHTML = "";

  const metrics = [
    { label: "Total Pageviews", value: Number(data.total_pageviews || 0).toLocaleString() },
    { label: "Total Sessions", value: Number(data.total_sessions || 0).toLocaleString() },
    {
      label: "Avg Load Time",
      value: data.average_load_time == null ? "0 ms" : `${Number(data.average_load_time).toFixed(2)} ms`,
    },
    { label: "Total Errors", value: Number(data.total_errors || 0).toLocaleString() },
  ];

  metrics.forEach((m) => {
    const card = document.createElement("div");
    card.className = "metric-card";

    const label = document.createElement("div");
    label.className = "metric-label";
    label.textContent = m.label;

    const value = document.createElement("div");
    value.className = "metric-value";
    value.textContent = m.value;

    card.appendChild(label);
    card.appendChild(value);
    container.appendChild(card);
  });
};

Dashboard.renderLineChart = function (canvas, dataPoints, labelKey, valueKey) {
  if (!canvas || !dataPoints || dataPoints.length === 0) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.offsetWidth);
  const H = (canvas.height = 250);
  const pad = { top: 20, right: 20, bottom: 40, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  const values = dataPoints.map((d) => Number(d[valueKey] || 0));
  const maxVal = Math.max(...values, 1);

  ctx.strokeStyle = "#ddd";
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, H - pad.bottom);
  ctx.lineTo(W - pad.right, H - pad.bottom);
  ctx.stroke();

  ctx.strokeStyle = "#2E86C1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  dataPoints.forEach((d, i) => {
    const x = pad.left + (i / (dataPoints.length - 1 || 1)) * plotW;
    const y = H - pad.bottom - (values[i] / maxVal) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#2E86C1";
  dataPoints.forEach((d, i) => {
    const x = pad.left + (i / (dataPoints.length - 1 || 1)) * plotW;
    const y = H - pad.bottom - (values[i] / maxVal) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#666";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  [0, Math.floor(dataPoints.length / 2), dataPoints.length - 1].forEach((i) => {
    if (!dataPoints[i]) return;
    const x = pad.left + (i / (dataPoints.length - 1 || 1)) * plotW;
    ctx.fillText(String(dataPoints[i][labelKey]).slice(0, 10), x, H - pad.bottom + 20);
  });

  ctx.textAlign = "right";
  ctx.fillText(maxVal.toLocaleString(), pad.left - 8, pad.top + 10);
  ctx.fillText("0", pad.left - 8, H - pad.bottom);
};

Dashboard.renderTable = function (container, pages) {
  if (!container) return;
  container.innerHTML = "";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>URL</th><th>Views</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  (pages || []).forEach((p) => {
    const tr = document.createElement("tr");
    const tdUrl = document.createElement("td");
    tdUrl.textContent = p.url || "";
    const tdViews = document.createElement("td");
    tdViews.textContent = Number(p.views || 0).toLocaleString();
    tr.appendChild(tdUrl);
    tr.appendChild(tdViews);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
};

Dashboard.renderOverview = async function () {
  const content = document.getElementById("content");
  const canEditComments = Dashboard.canEditComments();
  content.innerHTML = `
    <div id="cards" class="cards-grid"></div>
    <canvas id="chart" class="chart-canvas" style="margin: 20px 0;"></canvas>
    <div id="top-pages"></div>
    <section class="panel analyst-comment">
      <h3>Analyst Comment</h3>
      <div id="overview-comment-body"></div>
    </section>
  `;

  try {
    const range = Dashboard.getDateRange();
    const [dashboardRes, pageviewsRes] = await Promise.all([
      Dashboard.apiFetch(`/api/dashboard?start=${range.start}&end=${range.end}`),
      Dashboard.apiFetch(`/api/pageviews?start=${range.start}&end=${range.end}`),
    ]);

    if (!dashboardRes || !pageviewsRes) return;

    const dashboardData = dashboardRes.data || {};
    const pv = pageviewsRes.data || {};
    const byDay = pv.timeseries || [];
    const topPages = pv.top_pages || [];
    const commentText = "";

    Dashboard.currentSectionData.overview = {
      section: "overview",
      range: { start: range.start, end: range.end },
      cards: [
        { label: "Total Pageviews", value: Number(dashboardData.total_pageviews || 0).toLocaleString() },
        { label: "Total Sessions", value: Number(dashboardData.total_sessions || 0).toLocaleString() },
        {
          label: "Avg Load Time",
          value:
            dashboardData.average_load_time == null
              ? "0 ms"
              : `${Number(dashboardData.average_load_time).toFixed(2)} ms`,
        },
        { label: "Total Errors", value: Number(dashboardData.total_errors || 0).toLocaleString() },
      ],
      charts: [
        {
          id: "overview-trend",
          type: "line",
          labels: byDay.map((d) => String(d.date || "")),
          series: [{ label: "Views", values: byDay.map((d) => Number(d.views || 0)) }],
        },
      ],
      tables: [
        {
          id: "top-pages",
          columns: ["URL", "Views"],
          rows: topPages.map((row) => [row.url || "", Number(row.views || 0).toLocaleString()]),
        },
      ],
    };

    Dashboard.renderCards(dashboardData);
    Dashboard.renderLineChart(document.getElementById("chart"), byDay, "date", "views");
    Dashboard.renderTable(document.getElementById("top-pages"), topPages);

    const commentContainer = document.getElementById("overview-comment-body");
    if (canEditComments) {
      const input = document.createElement("textarea");
      input.id = "overview-comment";
      input.className = "analyst-comment-input";
      input.rows = 4;
      input.value = commentText;
      commentContainer.appendChild(input);
    } else {
      const p = document.createElement("p");
      p.id = "overview-comment";
      p.textContent = commentText;
      commentContainer.appendChild(p);
    }
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};
