window.Dashboard = window.Dashboard || {};

Dashboard.renderSessions = async function (start, end) {
  const content = document.getElementById("content");
  Dashboard.showLoading(content);

  try {
    const data = await Dashboard.apiFetch(`/api/sessions?start=${start}&end=${end}`);
    if (!data) return;

    const report = data.data || {};
    const summary = report.summary || {};
    const trend = report.timeseries || [];
    const depth = report.depth_buckets || [];

    content.innerHTML = `
      <section class="panel">
        <h2>Session Report</h2>
        <div class="cards-grid">
          <div class="metric-card"><div class="metric-label">Total Sessions</div><div class="metric-value">${Number(summary.total_sessions || 0).toLocaleString()}</div></div>
          <div class="metric-card"><div class="metric-label">Avg Duration</div><div class="metric-value">${summary.avg_duration_seconds == null ? "n/a" : `${Math.round(summary.avg_duration_seconds)} sec`}</div></div>
          <div class="metric-card"><div class="metric-label">Pages / Session</div><div class="metric-value">${summary.avg_pages_per_session == null ? "n/a" : Number(summary.avg_pages_per_session).toFixed(2)}</div></div>
          <div class="metric-card"><div class="metric-label">Bounce Rate</div><div class="metric-value">${summary.bounce_rate == null ? "n/a" : `${Number(summary.bounce_rate).toFixed(1)}%`}</div></div>
        </div>
      </section>

      <section class="panel">
        <h3>Sessions per Day</h3>
        <div id="sessionTrendChart" style="height:300px;width:100%;"></div>
      </section>

      <section class="panel">
        <h3>Session Depth</h3>
        <canvas id="sessionDepthChart"></canvas>
      </section>

      <section class="panel">
        <h3>Session Buckets</h3>
        <div id="session-table"></div>
        <div class="analyst-comment">
          <h3>Analyst Comment</h3>
          <p id="session-comment"></p>
        </div>
      </section>
    `;

    zingchart.render({
      id: "sessionTrendChart",
      data: {
        type: "line",
        scaleX: { labels: trend.map((d) => new Date(d.date).toLocaleDateString()) },
        series: [{ values: trend.map((d) => Number(d.sessions || 0)), lineColor: "#2E86C1" }],
      },
      height: 300,
      width: "100%",
    });

    new Chart(document.getElementById("sessionDepthChart"), {
      type: "bar",
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
    });

    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>Bucket</th><th>Sessions</th></tr></thead>";
    const tbody = document.createElement("tbody");
    depth.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.bucket}</td><td>${Number(row.sessions || 0).toLocaleString()}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    document.getElementById("session-table").appendChild(table);

    document.getElementById("session-comment").textContent =
      summary.bounce_rate != null && Number(summary.bounce_rate) > 50
        ? "Many sessions end after one page, so navigation or landing-page clarity likely needs improvement."
        : "Users appear to move beyond the first page often enough to suggest at least moderate engagement.";
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};

Dashboard.renderPerformance = async function (start, end) {
  const content = document.getElementById("content");
  Dashboard.showLoading(content);

  try {
    const data = await Dashboard.apiFetch(`/api/performance?start=${start}&end=${end}`);
    if (!data) return;

    content.innerHTML = `
      <section class="panel">
        <h2>Performance</h2>
        <canvas id="perf-chart"></canvas>
      </section>

      <section class="panel">
        <h3>Metrics</h3>
        <div id="perf-table"></div>
        <div class="analyst-comment">
          <h3>Analyst Comment</h3>
          <p id="perf-comment"></p>
        </div>
      </section>
    `;

    const perf = data.data || {};

    new Chart(document.getElementById("perf-chart"), {
      type: "bar",
      data: {
        labels: ["LCP", "CLS", "INP", "LOAD_TIME"],
        datasets: [
          { label: "p50", data: [perf.lcp?.p50 || 0, perf.cls?.p50 || 0, perf.inp?.p50 || 0, perf.load_time?.p50 || 0], backgroundColor: "#cbd5e1" },
          { label: "p75", data: [perf.lcp?.p75 || 0, perf.cls?.p75 || 0, perf.inp?.p75 || 0, perf.load_time?.p75 || 0], backgroundColor: "#94a3b8" },
          { label: "p95", data: [perf.lcp?.p95 || 0, perf.cls?.p95 || 0, perf.inp?.p95 || 0, perf.load_time?.p95 || 0], backgroundColor: "#64748b" },
        ]
      },
      options: { plugins: { legend: { position: "bottom" } } }
    });

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

    const worst = Object.entries(perf).reduce((best, [metric, value]) => {
      const current = Number(value?.p75 || 0);
      return !best || current > best.value ? { metric, value: current } : best;
    }, null);
    document.getElementById("perf-comment").textContent =
      worst ? `${worst.metric.toUpperCase()} has the highest p75 value, so it is the clearest candidate for optimization.` : "No performance data is available.";
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};

Dashboard.renderErrors = async function (start, end) {
  const content = document.getElementById("content");
  Dashboard.showLoading(content);

  try {
    const data = await Dashboard.apiFetch(`/api/errors?start=${start}&end=${end}`);
    if (!data) return;

    const trend = data.data.timeseries || [];
    const byMessage = data.data.top_errors || [];

    content.innerHTML = `
      <section class="panel">
        <h2>Error Report</h2>
        <div class="vitals-cards">
          <div class="vital-card">
            <h3>Total Errors</h3>
            <p id="totalErrors">0</p>
          </div>
        </div>
        <h3>Errors per Day</h3>
        <div id="errorTrendChart" style="height:300px;width:100%;"></div>
      </section>

      <section class="panel">
        <h3>Error Frequency</h3>
        <table class="perf-table">
          <thead>
            <tr><th>Error Message</th><th>Count</th><th>Last Seen</th></tr>
          </thead>
          <tbody id="errorBody"></tbody>
        </table>
        <div class="analyst-comment">
          <h3>Analyst Comment</h3>
          <p id="error-comment"></p>
        </div>
      </section>
    `;

    const totalErrors = trend.reduce((sum, d) => sum + d.errors, 0);
    document.getElementById("totalErrors").textContent = totalErrors;

    zingchart.render({
      id: "errorTrendChart",
      data: {
        type: "line",
        scaleX: { labels: trend.map((d) => new Date(d.date).toLocaleDateString()) },
        scaleY: { label: { text: "Errors" } },
        series: [{ values: trend.map((d) => d.errors), lineColor: "#2E86C1", marker: { backgroundColor: "#2E86C1" } }]
      },
      height: 300,
      width: "100%"
    });

    const tbody = document.getElementById("errorBody");
    const lastSeenDate =
      trend.length > 0
        ? new Date(Math.max(...trend.map((d) => new Date(d.date)))).toLocaleDateString()
        : "-";

    for (const row of byMessage) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.error_message}</td><td>${row.hits}</td><td>${lastSeenDate}</td>`;
      tbody.appendChild(tr);
    }

    const topError = byMessage[0];
    document.getElementById("error-comment").textContent =
      topError ? `"${topError.error_message}" is the most frequent error, so fixing it first should reduce the largest share of failures.` : "No errors were recorded for this date range.";
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};
