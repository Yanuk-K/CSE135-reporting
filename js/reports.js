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
  const showCards = Dashboard.isBlockEnabled("sessions", presentation, "cards", "cards");
  const showTrend = Dashboard.isBlockEnabled("sessions", presentation, "sessionsTrend", "charts");
  const showDepth = Dashboard.isBlockEnabled("sessions", presentation, "sessionsDepth", "charts");
  const showBounce = Dashboard.isBlockEnabled("sessions", presentation, "sessionsBounce", "charts");
  const showTable = Dashboard.isBlockEnabled("sessions", presentation, "sessionsTable", "table");
  const showComment = Dashboard.isBlockEnabled("sessions", presentation, "comment", "comments");

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
        <section class="panel report-builder-panel">
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
            <label><input type="checkbox" id="sessions-block-cards" ${showCards ? "checked" : ""}/> Summary Cards</label>
            <label><input type="checkbox" id="sessions-block-trend" ${showTrend ? "checked" : ""}/> Sessions Over Time</label>
            <label><input type="checkbox" id="sessions-block-depth" ${showDepth ? "checked" : ""}/> Session Depth Chart</label>
            <label><input type="checkbox" id="sessions-block-bounce" ${showBounce ? "checked" : ""}/> Bounce vs Engaged Chart</label>
            <label><input type="checkbox" id="sessions-block-table" ${showTable ? "checked" : ""}/> Session Buckets Table</label>
            <label><input type="checkbox" id="sessions-block-comment" ${showComment ? "checked" : ""}/> Analyst Comment</label>
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
        ${showCards ? '<div class="cards-grid">' : '<div class="cards-grid hidden">'}
          <div class="metric-card"><div class="metric-label">Total Sessions</div><div class="metric-value">${Number(summary.total_sessions || 0).toLocaleString()}</div></div>
          <div class="metric-card"><div class="metric-label">Avg Duration</div><div class="metric-value">${summary.avg_duration_seconds == null ? "n/a" : `${Math.round(summary.avg_duration_seconds)} sec`}</div></div>
          <div class="metric-card"><div class="metric-label">Pages / Session</div><div class="metric-value">${summary.avg_pages_per_session == null ? "n/a" : Number(summary.avg_pages_per_session).toFixed(2)}</div></div>
          <div class="metric-card"><div class="metric-label">Bounce Rate</div><div class="metric-value">${summary.bounce_rate == null ? "n/a" : `${Number(summary.bounce_rate).toFixed(1)}%`}</div></div>
        </div>
      </section>

      <section class="panel ${showTrend ? "" : "hidden"}">
        <h3>Sessions per Day</h3>
        <div id="sessionTrendChart" style="height:220px;width:100%;"></div>
      </section>

      <section class="panel ${showDepth ? "" : "hidden"}">
        <h3>Session Depth</h3>
        <div class="chart-wrap"><canvas id="sessionDepthChart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${showBounce ? "" : "hidden"}">
        <h3>Bounce vs Engaged</h3>
        <div class="chart-wrap"><canvas id="sessionBounceChart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${showTable ? "" : "hidden"}">
        <h3>Session Buckets</h3>
        <div id="session-table"></div>
        <div class="analyst-comment ${showComment ? "" : "hidden"}">
          <h3>Analyst Comment</h3>
          <div id="session-comment-body"></div>
        </div>
      </section>
    `;

    if (showTrend) {
      zingchart.render({
        id: "sessionTrendChart",
        data: {
          type: presentation.chartTypes["sessions-trend"] || "line",
          scaleX: { labels: trend.map((d) => new Date(d.date).toLocaleDateString()) },
          series: [{ values: trend.map((d) => Number(d.sessions || 0)), lineColor: Dashboard.getPaletteColor(0) }],
        },
        height: 220,
        width: "100%",
      });

    }
    if (showDepth) {
      Dashboard.renderManagedChart(document.getElementById("sessionDepthChart"), {
        type: presentation.chartTypes["sessions-depth"] || "bar",
        data: {
          labels: depth.map((d) => d.bucket),
            datasets: [{
              label: "Sessions",
              data: depth.map((d) => Number(d.sessions || 0)),
              borderWidth: 1,
            }],
        },
        options: { plugins: { legend: { display: false } } },
      }, "sessionDepthChart");
    }

    if (showBounce) {
      Dashboard.renderManagedChart(document.getElementById("sessionBounceChart"), {
        type: presentation.chartTypes["sessions-bounce"] || "doughnut",
        data: {
          labels: ["Bounce", "Engaged"],
            datasets: [{
              label: "Sessions",
              data: [bounceCount, engagedCount],
            }],
        },
        options: { plugins: { legend: { position: "bottom" } } },
      }, "sessionBounceChart");
    }

    if (showTable) {
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

    if (showComment) {
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
      Dashboard.bindPresentationControl("sessions", "sessions-block-cards", (el, state) => { state.enabledBlocks.cards = el.checked; });
      Dashboard.bindPresentationControl("sessions", "sessions-block-trend", (el, state) => { state.enabledBlocks.sessionsTrend = el.checked; });
      Dashboard.bindPresentationControl("sessions", "sessions-block-depth", (el, state) => { state.enabledBlocks.sessionsDepth = el.checked; });
      Dashboard.bindPresentationControl("sessions", "sessions-block-bounce", (el, state) => { state.enabledBlocks.sessionsBounce = el.checked; });
      Dashboard.bindPresentationControl("sessions", "sessions-block-table", (el, state) => { state.enabledBlocks.sessionsTable = el.checked; });
      Dashboard.bindPresentationControl("sessions", "sessions-block-comment", (el, state) => { state.enabledBlocks.comment = el.checked; });
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
  const showPercentiles = Dashboard.isBlockEnabled("performance", presentation, "perfPercentiles", "charts");
  const showComparison = Dashboard.isBlockEnabled("performance", presentation, "perfComparison", "charts");
  const showTable = Dashboard.isBlockEnabled("performance", presentation, "perfTable", "table");
  const showComment = Dashboard.isBlockEnabled("performance", presentation, "comment", "comments");

  try {
    const data = await Dashboard.apiFetch(`/api/performance?start=${start}&end=${end}`);
    if (!data) return;

    const builderHtml = canEditComments
      ? `
        <section class="panel report-builder-panel">
          <h3>Report Builder</h3>
          <div class="report-builder-form">
            <label>Comparison Chart
              <select id="perf-radar-type">
                <option value="radar" ${presentation.chartTypes["perf-radar"] === "radar" ? "selected" : ""}>Radar</option>
                <option value="bar" ${presentation.chartTypes["perf-radar"] === "bar" ? "selected" : ""}>Bar</option>
              </select>
            </label>
          </div>
          <div class="report-builder-toggles">
            <label><input type="checkbox" id="performance-block-percentiles" ${showPercentiles ? "checked" : ""}/> Percentiles Chart</label>
            <label><input type="checkbox" id="performance-block-comparison" ${showComparison ? "checked" : ""}/> p75 Comparison Chart</label>
            <label><input type="checkbox" id="performance-block-table" ${showTable ? "checked" : ""}/> Metrics Table</label>
            <label><input type="checkbox" id="performance-block-comment" ${showComment ? "checked" : ""}/> Analyst Comment</label>
          </div>
        </section>
      `
      : "";

    content.innerHTML = `
      ${builderHtml}
      <section class="panel ${showPercentiles ? "" : "hidden"}">
        <h2>Performance</h2>
        <div class="chart-wrap"><canvas id="perf-chart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${showComparison ? "" : "hidden"}">
        <h3>p75 Comparison</h3>
        <div class="chart-wrap"><canvas id="perf-radar-chart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${showTable ? "" : "hidden"}">
        <h3>Metrics</h3>
        <div id="perf-table"></div>
        <div class="analyst-comment ${showComment ? "" : "hidden"}">
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
          type: "bar",
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

    if (showPercentiles) {
      Dashboard.renderManagedChart(document.getElementById("perf-chart"), {
        type: "bar",
        data: {
          labels: ["LCP", "CLS", "INP", "LOAD_TIME"],
          datasets: [
            { label: "p50", data: [perf.lcp?.p50 || 0, perf.cls?.p50 || 0, perf.inp?.p50 || 0, perf.load_time?.p50 || 0] },
            { label: "p75", data: [perf.lcp?.p75 || 0, perf.cls?.p75 || 0, perf.inp?.p75 || 0, perf.load_time?.p75 || 0] },
            { label: "p95", data: [perf.lcp?.p95 || 0, perf.cls?.p95 || 0, perf.inp?.p95 || 0, perf.load_time?.p95 || 0] },
          ],
        },
        options: { plugins: { legend: { position: "bottom" } } },
      }, "perf-chart");
    }

    if (showComparison) {
      Dashboard.renderManagedChart(document.getElementById("perf-radar-chart"), {
        type: presentation.chartTypes["perf-radar"] || "radar",
        data: {
          labels: ["LCP", "CLS", "INP", "LOAD_TIME"],
          datasets: [
            {
              label: "p75",
              data: [perf.lcp?.p75 || 0, perf.cls?.p75 || 0, perf.inp?.p75 || 0, perf.load_time?.p75 || 0],
              backgroundColor: Dashboard.getPaletteColor(1),
              borderColor: Dashboard.getPaletteColor(0),
              borderWidth: 2,
            },
          ],
        },
      }, "perf-radar-chart");
    }

    if (showTable) {
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

    if (showComment) {
      Dashboard.renderCommentField(
        document.getElementById("perf-comment-body"),
        "perf-comment",
        ""
      );
    }

    if (canEditComments) {
      Dashboard.bindPresentationControl("performance", "perf-radar-type", (el, state) => { state.chartTypes["perf-radar"] = el.value; });
      Dashboard.bindPresentationControl("performance", "performance-block-percentiles", (el, state) => { state.enabledBlocks.perfPercentiles = el.checked; });
      Dashboard.bindPresentationControl("performance", "performance-block-comparison", (el, state) => { state.enabledBlocks.perfComparison = el.checked; });
      Dashboard.bindPresentationControl("performance", "performance-block-table", (el, state) => { state.enabledBlocks.perfTable = el.checked; });
      Dashboard.bindPresentationControl("performance", "performance-block-comment", (el, state) => { state.enabledBlocks.comment = el.checked; });
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
  const showCards = Dashboard.isBlockEnabled("errors", presentation, "cards", "cards");
  const showTrend = Dashboard.isBlockEnabled("errors", presentation, "errorTrend", "charts");
  const showTop = Dashboard.isBlockEnabled("errors", presentation, "errorTop", "charts");
  const showTable = Dashboard.isBlockEnabled("errors", presentation, "errorTable", "table");
  const showComment = Dashboard.isBlockEnabled("errors", presentation, "comment", "comments");

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
        <section class="panel report-builder-panel">
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
            <label><input type="checkbox" id="errors-block-cards" ${showCards ? "checked" : ""}/> Summary Cards</label>
            <label><input type="checkbox" id="errors-block-trend" ${showTrend ? "checked" : ""}/> Error Trend Chart</label>
            <label><input type="checkbox" id="errors-block-top" ${showTop ? "checked" : ""}/> Top Errors Chart</label>
            <label><input type="checkbox" id="errors-block-table" ${showTable ? "checked" : ""}/> Error Table</label>
            <label><input type="checkbox" id="errors-block-comment" ${showComment ? "checked" : ""}/> Analyst Comment</label>
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
      <section class="panel ${showCards ? "" : "hidden"}">
        <h2>Error Report</h2>
        <div class="vitals-cards">
          <div class="vital-card">
            <h3>Total Errors</h3>
            <p id="totalErrors">0</p>
          </div>
        </div>
      </section>

      <section class="panel ${showTrend ? "" : "hidden"}">
        <h3>Errors per Day</h3>
        <div id="errorTrendChart" style="height:220px;width:100%;"></div>
      </section>

      <section class="panel ${showTop ? "" : "hidden"}">
        <h3>Top Error Messages</h3>
        <div class="chart-wrap"><canvas id="errorTopChart" class="chart-canvas"></canvas></div>
      </section>

      <section class="panel ${showTable ? "" : "hidden"}">
        <h3>Error Frequency</h3>
        <table class="perf-table">
          <thead>
            <tr><th>Error Message</th><th>Count</th><th>Last Seen</th></tr>
          </thead>
          <tbody id="errorBody"></tbody>
        </table>
        <div class="analyst-comment ${showComment ? "" : "hidden"}">
          <h3>Analyst Comment</h3>
          <div id="error-comment-body"></div>
        </div>
      </section>
    `;

    const totalErrorEl = document.getElementById("totalErrors");
    if (totalErrorEl) totalErrorEl.textContent = totalErrors;

    if (showTrend) {
      zingchart.render({
        id: "errorTrendChart",
        data: {
          type: presentation.chartTypes["errors-trend"] || "line",
          scaleX: { labels: trend.map((d) => new Date(d.date).toLocaleDateString()) },
          scaleY: { label: { text: "Errors" } },
          series: [{ values: trend.map((d) => d.errors), lineColor: Dashboard.getPaletteColor(0), marker: { backgroundColor: Dashboard.getPaletteColor(0) } }],
        },
        height: 220,
        width: "100%",
      });
    }

    if (showTop) {
      Dashboard.renderManagedChart(document.getElementById("errorTopChart"), {
        type: presentation.chartTypes["errors-top"] || "bar",
        data: {
          labels: byMessage.slice(0, 8).map((row) => row.error_message || "Unknown"),
          datasets: [{
            label: "Hits",
            data: byMessage.slice(0, 8).map((row) => Number(row.hits || 0)),
          }],
        },
        options: { plugins: { legend: { position: "bottom" } } },
      }, "errorTopChart");
    }

    if (showTable) {
      const tbody = document.getElementById("errorBody");
      for (const row of byMessage) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.error_message}</td><td>${row.hits}</td><td>${lastSeenDate}</td>`;
        tbody.appendChild(tr);
      }
    }

    if (showComment) {
      Dashboard.renderCommentField(
        document.getElementById("error-comment-body"),
        "error-comment",
        ""
      );
    }

    if (canEditComments) {
      Dashboard.bindPresentationControl("errors", "errors-trend-type", (el, state) => { state.chartTypes["errors-trend"] = el.value; });
      Dashboard.bindPresentationControl("errors", "errors-top-type", (el, state) => { state.chartTypes["errors-top"] = el.value; });
      Dashboard.bindPresentationControl("errors", "errors-block-cards", (el, state) => { state.enabledBlocks.cards = el.checked; });
      Dashboard.bindPresentationControl("errors", "errors-block-trend", (el, state) => { state.enabledBlocks.errorTrend = el.checked; });
      Dashboard.bindPresentationControl("errors", "errors-block-top", (el, state) => { state.enabledBlocks.errorTop = el.checked; });
      Dashboard.bindPresentationControl("errors", "errors-block-table", (el, state) => { state.enabledBlocks.errorTable = el.checked; });
      Dashboard.bindPresentationControl("errors", "errors-block-comment", (el, state) => { state.enabledBlocks.comment = el.checked; });
    }

    if (Dashboard.destroyCommentEditors) Dashboard.destroyCommentEditors();
    if (Dashboard.initCommentEditors) Dashboard.initCommentEditors();
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};
