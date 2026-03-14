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

Dashboard.renderOverview = async function () {
  const content = document.getElementById("content");
  const presentation = Dashboard.getReportPresentation("overview");
  const canEditComments = Dashboard.canEditComments();
  const builderHtml = canEditComments
    ? `
      <section class="panel">
        <h3>Report Builder</h3>
        <div class="report-builder-form">
          <label>Trend Chart
            <select id="overview-trend-type">
              <option value="line" ${presentation.chartTypes["overview-trend"] === "line" ? "selected" : ""}>Line</option>
              <option value="bar" ${presentation.chartTypes["overview-trend"] === "bar" ? "selected" : ""}>Bar</option>
            </select>
          </label>
          <label>Top Pages Chart
            <select id="overview-top-type">
              <option value="bar" ${presentation.chartTypes["overview-top-pages"] === "bar" ? "selected" : ""}>Bar</option>
              <option value="doughnut" ${presentation.chartTypes["overview-top-pages"] === "doughnut" ? "selected" : ""}>Doughnut</option>
            </select>
          </label>
        </div>
        <div class="report-builder-toggles">
          <label><input type="checkbox" id="overview-inc-cards" ${presentation.include.cards ? "checked" : ""}/> Cards</label>
          <label><input type="checkbox" id="overview-inc-charts" ${presentation.include.charts ? "checked" : ""}/> Charts</label>
          <label><input type="checkbox" id="overview-inc-table" ${presentation.include.table ? "checked" : ""}/> Table</label>
          <label><input type="checkbox" id="overview-inc-comments" ${presentation.include.comments ? "checked" : ""}/> Comments</label>
        </div>
      </section>
    `
    : "";
  content.innerHTML = `
    ${builderHtml}
    ${presentation.include.cards ? '<div id="cards" class="cards-grid"></div>' : ""}
    ${presentation.include.charts ? '<section class="panel"><h3>Daily Pageviews Trend</h3><canvas id="overview-trend-chart" class="chart-canvas"></canvas></section>' : ""}
    ${presentation.include.charts ? '<section class="panel"><h3>Top Pages Distribution</h3><canvas id="overview-top-chart" class="chart-canvas"></canvas></section>' : ""}
    ${presentation.include.table ? '<section class="panel"><h3>Top Pages Table</h3><div id="top-pages"></div></section>' : ""}
    ${presentation.include.comments ? '<section class="panel analyst-comment"><h3>Analyst Comment</h3><div id="overview-comment-body"></div></section>' : ""}
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
    const totalTopViews = topPages.reduce((sum, row) => sum + Number(row.views || 0), 0) || 1;
    const topPageRows = topPages.map((row) => {
      const views = Number(row.views || 0);
      const share = ((views / totalTopViews) * 100).toFixed(1);
      return [row.url || "", views.toLocaleString(), `${share}%`];
    });

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
          title: "Daily Pageviews Trend",
          type: presentation.chartTypes["overview-trend"] || "line",
          labels: byDay.map((d) => String(d.date || "")),
          series: [{ label: "Views", values: byDay.map((d) => Number(d.views || 0)) }],
        },
        {
          id: "overview-top-pages",
          title: "Top Pages Distribution",
          type: presentation.chartTypes["overview-top-pages"] || "bar",
          labels: topPages.slice(0, 8).map((row) => row.url || ""),
          series: [{ label: "Views", values: topPages.slice(0, 8).map((row) => Number(row.views || 0)) }],
        },
      ],
      tables: [
        {
          id: "top-pages",
          title: "Top Pages Table",
          columns: ["URL", "Views", "Share"],
          rows: topPageRows,
        },
      ],
    };

    if (presentation.include.cards) {
      Dashboard.renderCards(dashboardData);
    }

    if (presentation.include.charts) {
      const trendCanvas = document.getElementById("overview-trend-chart");
      if (trendCanvas) {
        Dashboard.renderManagedChart(trendCanvas, {
          type: presentation.chartTypes["overview-trend"] || "line",
          data: {
            labels: byDay.map((d) => String(d.date || "").slice(0, 10)),
            datasets: [{
              label: "Views",
              data: byDay.map((d) => Number(d.views || 0)),
              borderColor: "#2E86C1",
              backgroundColor: "#93c5fd",
              fill: false,
              tension: 0.2,
            }],
          },
          options: { plugins: { legend: { position: "bottom" } } },
        }, "overview-trend-chart");
      }

      const topCanvas = document.getElementById("overview-top-chart");
      if (topCanvas) {
        Dashboard.renderManagedChart(topCanvas, {
          type: presentation.chartTypes["overview-top-pages"] || "bar",
          data: {
            labels: topPages.slice(0, 8).map((row) => row.url || ""),
            datasets: [{
              label: "Views",
              data: topPages.slice(0, 8).map((row) => Number(row.views || 0)),
              backgroundColor: ["#2E86C1", "#60a5fa", "#94a3b8", "#64748b", "#93c5fd", "#cbd5e1", "#1d4ed8", "#334155"],
            }],
          },
          options: { plugins: { legend: { position: "bottom" } } },
        }, "overview-top-chart");
      }
    }

    if (presentation.include.table) {
      const tableContainer = document.getElementById("top-pages");
      if (tableContainer) {
        const table = document.createElement("table");
        table.innerHTML = "<thead><tr><th>URL</th><th>Views</th><th>Share</th></tr></thead>";
        const tbody = document.createElement("tbody");
        topPageRows.forEach((row) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td>`;
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableContainer.appendChild(table);
      }
    }

    if (presentation.include.comments) {
      const commentContainer = document.getElementById("overview-comment-body");
      if (commentContainer) {
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
      }
    }

    if (canEditComments) {
      Dashboard.bindPresentationControl("overview", "overview-trend-type", (el, state) => {
        state.chartTypes["overview-trend"] = el.value;
      });
      Dashboard.bindPresentationControl("overview", "overview-top-type", (el, state) => {
        state.chartTypes["overview-top-pages"] = el.value;
      });
      Dashboard.bindPresentationControl("overview", "overview-inc-cards", (el, state) => {
        state.include.cards = el.checked;
      });
      Dashboard.bindPresentationControl("overview", "overview-inc-charts", (el, state) => {
        state.include.charts = el.checked;
      });
      Dashboard.bindPresentationControl("overview", "overview-inc-table", (el, state) => {
        state.include.table = el.checked;
      });
      Dashboard.bindPresentationControl("overview", "overview-inc-comments", (el, state) => {
        state.include.comments = el.checked;
      });
    }

    if (Dashboard.destroyCommentEditors) Dashboard.destroyCommentEditors();
    if (Dashboard.initCommentEditors) Dashboard.initCommentEditors();
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};
