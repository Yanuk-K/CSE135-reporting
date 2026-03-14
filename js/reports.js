window.Dashboard = window.Dashboard || {};

Dashboard.renderCommentField = function (container, id, text) {
  container.innerHTML = "";
  if (Dashboard.canEditComments()) {
    const input = document.createElement("textarea");
    input.id = id;
    input.className = "analyst-comment-input";
    input.rows = 4;
    input.value = text;
    container.appendChild(input);
    return;
  }
  const p = document.createElement("p");
  p.id = id;
  p.textContent = text;
  container.appendChild(p);
};

Dashboard.renderSessions = async function (start, end) {
  const content = document.getElementById("content");
  Dashboard.showLoading(content);
  const canEditComments = Dashboard.canEditComments();
  const presentation = Dashboard.getReportPresentation("sessions");

  try {
    const data = await Dashboard.apiFetch(`/api/sessions?start=${start}&end=${end}`);
    if (!data) return;

    const report = data.data || {};
    const summary = report.summary || {};
    const trend = report.timeseries || [];
    const depth = report.depth_buckets || [];
    const totalSessions = Number(summary.total_sessions || 0);
    const bounceRate = Number(summary.bounce_rate || 0);
    const bounceCount = Math.round((bounceRate / 100) * totalSessions);
    const engagedCount = Math.max(0, totalSessions - bounceCount);

    const builderHtml = canEditComments
      ? `
        <section class="panel">
          <h3>Report Builder</h3>
          <div class="report-builder-form">
            <label>Trend Chart
              <select id="sessions-trend-type">
                <option value="line" ${presentation.chartTypes["sessions-trend"] === "line" ? "selected" : ""}>Line</option>
                <option value="bar" ${presentation.chartTypes["sessions-trend"] === "bar" ? "selected" : ""}>Bar</option>
              </select>
            </label>
            <label>Depth Chart
              <select id="sessions-depth-type">
                <option value="bar" ${presentation.chartTypes["sessions-depth"] === "bar" ? "selected" : ""}>Bar</option>
                <option value="line" ${presentation.chartTypes["sessions-depth"] === "line" ? "selected" : ""}>Line</option>
              </select>
            </label>
            <label>Bounce Chart
              <select id="sessions-bounce-type">
                <option value="doughnut" ${presentation.chartTypes["sessions-bounce"] === "doughnut" ? "selected" : ""}>Doughnut</option>
                <option value="bar" ${presentation.chartTypes["sessions-bounce"] === "bar" ? "selected" : ""}>Bar</option>
              </select>
            </label>
          </div>
          <div class="report-builder-toggles">
            <label><input type="checkbox" id="sessions-inc-cards" ${presentation.include.cards ? "checked" : ""}/> Cards</label>
            <label><input type="checkbox" id="sessions-inc-charts" ${presentation.include.charts ? "checked" : ""}/> Charts</label>
            <label><input type="checkbox" id="sessions-inc-table" ${presentation.include.table ? "checked" : ""}/> Table</label>
            <label><input type="checkbox" id="sessions-inc-comments" ${presentation.include.comments ? "checked" : ""}/> Comments</label>
          </div>
        </section>
      `
      : "";

    Dashboard.currentSectionData.sessions = {
      section: "sessions",
      range: { start, end },
      cards: [
        { label: "Total Sessions", value: Number(summary.total_sessions || 0).toLocaleString() },
        {
          label: "Avg Duration",
          value: summary.avg_duration_seconds == null ? "n/a" : `${Math.round(summary.avg_duration_seconds)} sec`,
        },
        {
          label: "Pages / Session",
          value: summary.avg_pages_per_session == null ? "n/a" : Number(summary.avg_pages_per_session).toFixed(2),
        },
        {
          label: "Bounce Rate",
          value: summary.bounce_rate == null ? "n/a" : `${Number(summary.bounce_rate).toFixed(1)}%`,
        },
      ],
      charts: [
        {
          id: "sessions-trend",
          title: "Sessions per Day",
          type: presentation.chartTypes["sessions-trend"] || "line",
          labels: trend.map((d) => new Date(d.date).toLocaleDateString()),
          series: [{ label: "Sessions", values: trend.map((d) => Number(d.sessions || 0)) }],
        },
        {
          id: "sessions-depth",
          title: "Session Depth",
          type: presentation.chartTypes["sessions-depth"] || "bar",
          labels: depth.map((d) => d.bucket),
          series: [{ label: "Sessions", values: depth.map((d) => Number(d.sessions || 0)) }],
        },
        {
          id: "sessions-bounce",
          title: "Bounce vs Engaged",
          type: presentation.chartTypes["sessions-bounce"] || "doughnut",
          labels: ["Bounce", "Engaged"],
          series: [{ label: "Sessions", values: [bounceCount, engagedCount] }],
        },
      ],
      tables: [
        {
          id: "session-buckets",
          title: "Session Buckets",
          columns: ["Bucket", "Sessions", "Share"],
          rows: depth.map((row) => {
            const value = Number(row.sessions || 0);
            const share = totalSessions ? ((value / totalSessions) * 100).toFixed(1) : "0.0";
            return [row.bucket, value.toLocaleString(), `${share}%`];
          }),
        },
      ],
    };

    content.innerHTML = `
      ${builderHtml}
      <section class="panel">
        <h2>Session Report</h2>
        ${presentation.include.cards ? '<div class="cards-grid">' : '<div class="cards-grid hidden">'}
          <div class="metric-card"><div class="metric-label">Total Sessions</div><div class="metric-value">${Number(summary.total_sessions || 0).toLocaleString()}</div></div>
          <div class="metric-card"><div class="metric-label">Avg Duration</div><div class="metric-value">${summary.avg_duration_seconds == null ? "n/a" : `${Math.round(summary.avg_duration_seconds)} sec`}</div></div>
          <div class="metric-card"><div class="metric-label">Pages / Session</div><div class="metric-value">${summary.avg_pages_per_session == null ? "n/a" : Number(summary.avg_pages_per_session).toFixed(2)}</div></div>
          <div class="metric-card"><div class="metric-label">Bounce Rate</div><div class="metric-value">${summary.bounce_rate == null ? "n/a" : `${Number(summary.bounce_rate).toFixed(1)}%`}</div></div>
        </div>
      </section>

      <section class="panel ${presentation.include.charts ? "" : "hidden"}">
        <h3>Sessions per Day</h3>
        <div id="sessionTrendChart" style="height:220px;width:100%;"></div>
      </section>

      <section class="panel ${presentation.include.charts ? "" : "hidden"}">
        <h3>Session Depth</h3>
        <div class="chart-wrap"><canvas id="sessionDepthChart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${presentation.include.charts ? "" : "hidden"}">
        <h3>Bounce vs Engaged</h3>
        <div class="chart-wrap"><canvas id="sessionBounceChart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${presentation.include.table ? "" : "hidden"}">
        <h3>Session Buckets</h3>
        <div id="session-table"></div>
        <div class="analyst-comment ${presentation.include.comments ? "" : "hidden"}">
          <h3>Analyst Comment</h3>
          <div id="session-comment-body"></div>
        </div>
      </section>
    `;

    if (presentation.include.charts) {
      zingchart.render({
        id: "sessionTrendChart",
        data: {
          type: presentation.chartTypes["sessions-trend"] || "line",
          scaleX: { labels: trend.map((d) => new Date(d.date).toLocaleDateString()) },
          series: [{ values: trend.map((d) => Number(d.sessions || 0)), lineColor: "#2E86C1" }],
        },
        height: 220,
        width: "100%",
      });

      Dashboard.renderManagedChart(document.getElementById("sessionDepthChart"), {
        type: presentation.chartTypes["sessions-depth"] || "bar",
        data: {
          labels: depth.map((d) => d.bucket),
          datasets: [{
            label: "Sessions",
            data: depth.map((d) => Number(d.sessions || 0)),
            backgroundColor: "#93c5fd",
            borderColor: "#60a5fa",
            borderWidth: 1,
          }],
        },
        options: { plugins: { legend: { display: false } } },
      }, "sessionDepthChart");

      Dashboard.renderManagedChart(document.getElementById("sessionBounceChart"), {
        type: presentation.chartTypes["sessions-bounce"] || "doughnut",
        data: {
          labels: ["Bounce", "Engaged"],
          datasets: [{
            label: "Sessions",
            data: [bounceCount, engagedCount],
            backgroundColor: ["#ef4444", "#22c55e"],
          }],
        },
        options: { plugins: { legend: { position: "bottom" } } },
      }, "sessionBounceChart");
    }

    if (presentation.include.table) {
      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>Bucket</th><th>Sessions</th><th>Share</th></tr></thead>";
      const tbody = document.createElement("tbody");
      depth.forEach((row) => {
        const value = Number(row.sessions || 0);
        const share = totalSessions ? ((value / totalSessions) * 100).toFixed(1) : "0.0";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.bucket}</td><td>${value.toLocaleString()}</td><td>${share}%</td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      document.getElementById("session-table").appendChild(table);
    }

    if (presentation.include.comments) {
      Dashboard.renderCommentField(
        document.getElementById("session-comment-body"),
        "session-comment",
        ""
      );
    }

    if (canEditComments) {
      Dashboard.bindPresentationControl("sessions", "sessions-trend-type", (el, state) => { state.chartTypes["sessions-trend"] = el.value; });
      Dashboard.bindPresentationControl("sessions", "sessions-depth-type", (el, state) => { state.chartTypes["sessions-depth"] = el.value; });
      Dashboard.bindPresentationControl("sessions", "sessions-bounce-type", (el, state) => { state.chartTypes["sessions-bounce"] = el.value; });
      Dashboard.bindPresentationControl("sessions", "sessions-inc-cards", (el, state) => { state.include.cards = el.checked; });
      Dashboard.bindPresentationControl("sessions", "sessions-inc-charts", (el, state) => { state.include.charts = el.checked; });
      Dashboard.bindPresentationControl("sessions", "sessions-inc-table", (el, state) => { state.include.table = el.checked; });
      Dashboard.bindPresentationControl("sessions", "sessions-inc-comments", (el, state) => { state.include.comments = el.checked; });
    }

    if (Dashboard.destroyCommentEditors) Dashboard.destroyCommentEditors();
    if (Dashboard.initCommentEditors) Dashboard.initCommentEditors();
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};

Dashboard.renderPerformance = async function (start, end) {
  const content = document.getElementById("content");
  Dashboard.showLoading(content);
  const canEditComments = Dashboard.canEditComments();
  const presentation = Dashboard.getReportPresentation("performance");

  try {
    const data = await Dashboard.apiFetch(`/api/performance?start=${start}&end=${end}`);
    if (!data) return;

    const builderHtml = canEditComments
      ? `
        <section class="panel">
          <h3>Report Builder</h3>
          <div class="report-builder-form">
            <label>Percentiles Chart
              <select id="perf-percentiles-type">
                <option value="bar" ${presentation.chartTypes["perf-percentiles"] === "bar" ? "selected" : ""}>Bar</option>
                <option value="line" ${presentation.chartTypes["perf-percentiles"] === "line" ? "selected" : ""}>Line</option>
              </select>
            </label>
            <label>Radar Chart
              <select id="perf-radar-type">
                <option value="radar" ${presentation.chartTypes["perf-radar"] === "radar" ? "selected" : ""}>Radar</option>
                <option value="bar" ${presentation.chartTypes["perf-radar"] === "bar" ? "selected" : ""}>Bar</option>
              </select>
            </label>
          </div>
          <div class="report-builder-toggles">
            <label><input type="checkbox" id="performance-inc-cards" ${presentation.include.cards ? "checked" : ""}/> Cards</label>
            <label><input type="checkbox" id="performance-inc-charts" ${presentation.include.charts ? "checked" : ""}/> Charts</label>
            <label><input type="checkbox" id="performance-inc-table" ${presentation.include.table ? "checked" : ""}/> Table</label>
            <label><input type="checkbox" id="performance-inc-comments" ${presentation.include.comments ? "checked" : ""}/> Comments</label>
          </div>
        </section>
      `
      : "";

    content.innerHTML = `
      ${builderHtml}
      <section class="panel ${presentation.include.charts ? "" : "hidden"}">
        <h2>Performance</h2>
        <div class="chart-wrap"><canvas id="perf-chart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${presentation.include.charts ? "" : "hidden"}">
        <h3>p75 Comparison</h3>
        <div class="chart-wrap"><canvas id="perf-radar-chart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${presentation.include.table ? "" : "hidden"}">
        <h3>Metrics</h3>
        <div id="perf-table"></div>
        <div class="analyst-comment ${presentation.include.comments ? "" : "hidden"}">
          <h3>Analyst Comment</h3>
          <div id="perf-comment-body"></div>
        </div>
      </section>
    `;

    const perf = data.data || {};

    Dashboard.currentSectionData.performance = {
      section: "performance",
      range: { start, end },
      cards: [],
      charts: [
        {
          id: "perf-percentiles",
          title: "Web Vitals Percentiles",
          type: presentation.chartTypes["perf-percentiles"] || "bar",
          labels: ["LCP", "CLS", "INP", "LOAD_TIME"],
          series: [
            { label: "p50", values: [perf.lcp?.p50 || 0, perf.cls?.p50 || 0, perf.inp?.p50 || 0, perf.load_time?.p50 || 0] },
            { label: "p75", values: [perf.lcp?.p75 || 0, perf.cls?.p75 || 0, perf.inp?.p75 || 0, perf.load_time?.p75 || 0] },
            { label: "p95", values: [perf.lcp?.p95 || 0, perf.cls?.p95 || 0, perf.inp?.p95 || 0, perf.load_time?.p95 || 0] },
          ],
        },
        {
          id: "perf-radar",
          title: "p75 Comparison",
          type: presentation.chartTypes["perf-radar"] || "radar",
          labels: ["LCP", "CLS", "INP", "LOAD_TIME"],
          series: [
            { label: "p75", values: [perf.lcp?.p75 || 0, perf.cls?.p75 || 0, perf.inp?.p75 || 0, perf.load_time?.p75 || 0] },
          ],
        },
      ],
      tables: [
        {
          id: "perf-metrics",
          title: "Metrics",
          columns: ["Metric", "p50", "p75", "p95"],
          rows: Object.entries(perf).map(([metric, value]) => [
            metric.replace("_", " ").toUpperCase(),
            metric === "cls" ? (value.p50 ?? "n/a") : (value.p50 != null ? `${Number(value.p50).toFixed(2)} ms` : "n/a"),
            metric === "cls" ? (value.p75 ?? "n/a") : (value.p75 != null ? `${Number(value.p75).toFixed(2)} ms` : "n/a"),
            metric === "cls" ? (value.p95 ?? "n/a") : (value.p95 != null ? `${Number(value.p95).toFixed(2)} ms` : "n/a"),
          ]),
        },
      ],
    };

    if (presentation.include.charts) {
      Dashboard.renderManagedChart(document.getElementById("perf-chart"), {
        type: presentation.chartTypes["perf-percentiles"] || "bar",
        data: {
          labels: ["LCP", "CLS", "INP", "LOAD_TIME"],
          datasets: [
            { label: "p50", data: [perf.lcp?.p50 || 0, perf.cls?.p50 || 0, perf.inp?.p50 || 0, perf.load_time?.p50 || 0], backgroundColor: "#cbd5e1" },
            { label: "p75", data: [perf.lcp?.p75 || 0, perf.cls?.p75 || 0, perf.inp?.p75 || 0, perf.load_time?.p75 || 0], backgroundColor: "#94a3b8" },
            { label: "p95", data: [perf.lcp?.p95 || 0, perf.cls?.p95 || 0, perf.inp?.p95 || 0, perf.load_time?.p95 || 0], backgroundColor: "#64748b" },
          ],
        },
        options: { plugins: { legend: { position: "bottom" } } },
      }, "perf-chart");

      Dashboard.renderManagedChart(document.getElementById("perf-radar-chart"), {
        type: presentation.chartTypes["perf-radar"] || "radar",
        data: {
          labels: ["LCP", "CLS", "INP", "LOAD_TIME"],
          datasets: [
            {
              label: "p75",
              data: [perf.lcp?.p75 || 0, perf.cls?.p75 || 0, perf.inp?.p75 || 0, perf.load_time?.p75 || 0],
              backgroundColor: "rgba(59,130,246,0.2)",
              borderColor: "#2563eb",
              borderWidth: 2,
            },
          ],
        },
      }, "perf-radar-chart");
    }

    if (presentation.include.table) {
      const table = document.createElement("table");
      table.innerHTML = `
        <thead>
          <tr><th>Metric</th><th>p50</th><th>p75</th><th>p95</th></tr>
        </thead>
      `;
      const tbody = document.createElement("tbody");

      Object.entries(perf).forEach(([metric, value]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${metric.replace("_", " ").toUpperCase()}</td>
          <td>${metric === "cls" ? (value.p50 ?? "n/a") : (value.p50 != null ? `${Number(value.p50).toFixed(2)} ms` : "n/a")}</td>
          <td>${metric === "cls" ? (value.p75 ?? "n/a") : (value.p75 != null ? `${Number(value.p75).toFixed(2)} ms` : "n/a")}</td>
          <td>${metric === "cls" ? (value.p95 ?? "n/a") : (value.p95 != null ? `${Number(value.p95).toFixed(2)} ms` : "n/a")}</td>
        `;
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      document.getElementById("perf-table").appendChild(table);
    }

    if (presentation.include.comments) {
      Dashboard.renderCommentField(
        document.getElementById("perf-comment-body"),
        "perf-comment",
        ""
      );
    }

    if (canEditComments) {
      Dashboard.bindPresentationControl("performance", "perf-percentiles-type", (el, state) => { state.chartTypes["perf-percentiles"] = el.value; });
      Dashboard.bindPresentationControl("performance", "perf-radar-type", (el, state) => { state.chartTypes["perf-radar"] = el.value; });
      Dashboard.bindPresentationControl("performance", "performance-inc-cards", (el, state) => { state.include.cards = el.checked; });
      Dashboard.bindPresentationControl("performance", "performance-inc-charts", (el, state) => { state.include.charts = el.checked; });
      Dashboard.bindPresentationControl("performance", "performance-inc-table", (el, state) => { state.include.table = el.checked; });
      Dashboard.bindPresentationControl("performance", "performance-inc-comments", (el, state) => { state.include.comments = el.checked; });
    }

    if (Dashboard.destroyCommentEditors) Dashboard.destroyCommentEditors();
    if (Dashboard.initCommentEditors) Dashboard.initCommentEditors();
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};

Dashboard.renderErrors = async function (start, end) {
  const content = document.getElementById("content");
  Dashboard.showLoading(content);
  const canEditComments = Dashboard.canEditComments();
  const presentation = Dashboard.getReportPresentation("errors");

  try {
    const data = await Dashboard.apiFetch(`/api/errors?start=${start}&end=${end}`);
    if (!data) return;

    const trend = data.data.timeseries || [];
    const byMessage = data.data.top_errors || [];

    const totalErrors = trend.reduce((sum, d) => sum + d.errors, 0);
    const lastSeenDate =
      trend.length > 0
        ? new Date(Math.max(...trend.map((d) => new Date(d.date)))).toLocaleDateString()
        : "-";

    const builderHtml = canEditComments
      ? `
        <section class="panel">
          <h3>Report Builder</h3>
          <div class="report-builder-form">
            <label>Trend Chart
              <select id="errors-trend-type">
                <option value="line" ${presentation.chartTypes["errors-trend"] === "line" ? "selected" : ""}>Line</option>
                <option value="bar" ${presentation.chartTypes["errors-trend"] === "bar" ? "selected" : ""}>Bar</option>
              </select>
            </label>
            <label>Top Errors Chart
              <select id="errors-top-type">
                <option value="bar" ${presentation.chartTypes["errors-top"] === "bar" ? "selected" : ""}>Bar</option>
                <option value="doughnut" ${presentation.chartTypes["errors-top"] === "doughnut" ? "selected" : ""}>Doughnut</option>
              </select>
            </label>
          </div>
          <div class="report-builder-toggles">
            <label><input type="checkbox" id="errors-inc-cards" ${presentation.include.cards ? "checked" : ""}/> Cards</label>
            <label><input type="checkbox" id="errors-inc-charts" ${presentation.include.charts ? "checked" : ""}/> Charts</label>
            <label><input type="checkbox" id="errors-inc-table" ${presentation.include.table ? "checked" : ""}/> Table</label>
            <label><input type="checkbox" id="errors-inc-comments" ${presentation.include.comments ? "checked" : ""}/> Comments</label>
          </div>
        </section>
      `
      : "";

    Dashboard.currentSectionData.errors = {
      section: "errors",
      range: { start, end },
      cards: [{ label: "Total Errors", value: String(totalErrors) }],
      charts: [
        {
          id: "errors-trend",
          title: "Errors per Day",
          type: presentation.chartTypes["errors-trend"] || "line",
          labels: trend.map((d) => new Date(d.date).toLocaleDateString()),
          series: [{ label: "Errors", values: trend.map((d) => Number(d.errors || 0)) }],
        },
        {
          id: "errors-top",
          title: "Top Error Messages",
          type: presentation.chartTypes["errors-top"] || "bar",
          labels: byMessage.slice(0, 8).map((row) => row.error_message || "Unknown"),
          series: [{ label: "Hits", values: byMessage.slice(0, 8).map((row) => Number(row.hits || 0)) }],
        },
      ],
      tables: [
        {
          id: "top-errors",
          title: "Error Frequency",
          columns: ["Error Message", "Count", "Last Seen"],
          rows: byMessage.map((row) => [row.error_message, String(row.hits), lastSeenDate]),
        },
      ],
    };

    content.innerHTML = `
      ${builderHtml}
      <section class="panel ${presentation.include.cards ? "" : "hidden"}">
        <h2>Error Report</h2>
        <div class="vitals-cards">
          <div class="vital-card">
            <h3>Total Errors</h3>
            <p id="totalErrors">0</p>
          </div>
        </div>
      </section>

      <section class="panel ${presentation.include.charts ? "" : "hidden"}">
        <h3>Errors per Day</h3>
        <div id="errorTrendChart" style="height:220px;width:100%;"></div>
      </section>

      <section class="panel ${presentation.include.charts ? "" : "hidden"}">
        <h3>Top Error Messages</h3>
        <div class="chart-wrap"><canvas id="errorTopChart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${presentation.include.table ? "" : "hidden"}">
        <h3>Error Frequency</h3>
        <table class="perf-table">
          <thead>
            <tr><th>Error Message</th><th>Count</th><th>Last Seen</th></tr>
          </thead>
          <tbody id="errorBody"></tbody>
        </table>
        <div class="analyst-comment ${presentation.include.comments ? "" : "hidden"}">
          <h3>Analyst Comment</h3>
          <div id="error-comment-body"></div>
        </div>
      </section>
    `;

    const totalErrorEl = document.getElementById("totalErrors");
    if (totalErrorEl) totalErrorEl.textContent = totalErrors;

    if (presentation.include.charts) {
      zingchart.render({
        id: "errorTrendChart",
        data: {
          type: presentation.chartTypes["errors-trend"] || "line",
          scaleX: { labels: trend.map((d) => new Date(d.date).toLocaleDateString()) },
          scaleY: { label: { text: "Errors" } },
          series: [{ values: trend.map((d) => d.errors), lineColor: "#2E86C1", marker: { backgroundColor: "#2E86C1" } }],
        },
        height: 220,
        width: "100%",
      });

      Dashboard.renderManagedChart(document.getElementById("errorTopChart"), {
        type: presentation.chartTypes["errors-top"] || "bar",
        data: {
          labels: byMessage.slice(0, 8).map((row) => row.error_message || "Unknown"),
          datasets: [{
            label: "Hits",
            data: byMessage.slice(0, 8).map((row) => Number(row.hits || 0)),
            backgroundColor: ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6"],
          }],
        },
        options: { plugins: { legend: { position: "bottom" } } },
      }, "errorTopChart");
    }

    if (presentation.include.table) {
      const tbody = document.getElementById("errorBody");
      for (const row of byMessage) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.error_message}</td><td>${row.hits}</td><td>${lastSeenDate}</td>`;
        tbody.appendChild(tr);
      }
    }

    if (presentation.include.comments) {
      Dashboard.renderCommentField(
        document.getElementById("error-comment-body"),
        "error-comment",
        ""
      );
    }

    if (canEditComments) {
      Dashboard.bindPresentationControl("errors", "errors-trend-type", (el, state) => { state.chartTypes["errors-trend"] = el.value; });
      Dashboard.bindPresentationControl("errors", "errors-top-type", (el, state) => { state.chartTypes["errors-top"] = el.value; });
      Dashboard.bindPresentationControl("errors", "errors-inc-cards", (el, state) => { state.include.cards = el.checked; });
      Dashboard.bindPresentationControl("errors", "errors-inc-charts", (el, state) => { state.include.charts = el.checked; });
      Dashboard.bindPresentationControl("errors", "errors-inc-table", (el, state) => { state.include.table = el.checked; });
      Dashboard.bindPresentationControl("errors", "errors-inc-comments", (el, state) => { state.include.comments = el.checked; });
    }

    if (Dashboard.destroyCommentEditors) Dashboard.destroyCommentEditors();
    if (Dashboard.initCommentEditors) Dashboard.initCommentEditors();
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};
