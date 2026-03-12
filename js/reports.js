window.Dashboard = window.Dashboard || {};

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
      </section>
    `;

    const perf = data.data || {};

    const ctx = document.getElementById("perf-chart");

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["LCP", "CLS", "INP", "LOAD_TIME"],
        datasets: [
          {
            label: "p50",
            data: [
              perf.lcp?.p50 || 0,
              perf.cls?.p50 || 0,
              perf.inp?.p50 || 0,
              perf.load_time?.p50 || 0
            ]
          },
          {
            label: "p75",
            data: [
              perf.lcp?.p75 || 0,
              perf.cls?.p75 || 0,
              perf.inp?.p75 || 0,
              perf.load_time?.p75 || 0
            ]
          },
          {
            label: "p95",
            data: [
              perf.lcp?.p95 || 0,
              perf.cls?.p95 || 0,
              perf.inp?.p95 || 0,
              perf.load_time?.p95 || 0
            ]
          }
        ]
      }
    });

    const table = document.createElement("table");

    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Metric</th>
        <th>p50</th>
        <th>p75</th>
        <th>p95</th>
      </tr>
    `;

    const tbody = document.createElement("tbody");

    Object.entries(perf).forEach(([metric, value]) => {
      const tr = document.createElement("tr");

      const tdMetric = document.createElement("td");
      tdMetric.textContent = metric
        .replace("_", " ")
        .toUpperCase();

      const tdP50 = document.createElement("td");
      tdP50.textContent =
        metric === "cls"
          ? value.p50 ?? "n/a"
          : (value.p50 != null ? Number(value.p50).toFixed(2) + " ms" : "n/a");

      const tdP75 = document.createElement("td");
      tdP75.textContent =
        metric === "cls"
          ? value.p75 ?? "n/a"
          : (value.p75 != null ? Number(value.p75).toFixed(2) + " ms" : "n/a");

      const tdP95 = document.createElement("td");
      tdP95.textContent =
        metric === "cls"
          ? value.p95 ?? "n/a"
          : (value.p95 != null ? Number(value.p95).toFixed(2) + " ms" : "n/a");

      tr.appendChild(tdMetric);
      tr.appendChild(tdP50);
      tr.appendChild(tdP75);
      tr.appendChild(tdP95);

      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    document.getElementById("perf-table").appendChild(table);

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
            <tr>
              <th>Error Message</th>
              <th>Count</th>
              <th>Last Seen</th>
            </tr>
          </thead>

          <tbody id="errorBody"></tbody>

        </table>

      </section>
    `;

    const totalErrors = trend.reduce((sum, d) => sum + d.errors, 0);
    document.getElementById("totalErrors").textContent = totalErrors;

    const labels = trend.map(d =>
      new Date(d.date).toLocaleDateString()
    );

    const values = trend.map(d => d.errors);

    const chartConfig = {

      type: "line",

      scaleX: {
        labels: labels,
        label: { text: "Date" }
      },

      scaleY: {
        label: { text: "Errors" }
      },

      series: [
        {
          values: values,
          lineColor: "#2E86C1",
          marker: {
            backgroundColor: "#2E86C1"
          }
        }
      ]
    };

    zingchart.render({
      id: "errorTrendChart",
      data: chartConfig,
      height: 300,
      width: "100%"
    });

    const tbody = document.getElementById("errorBody");
    const lastSeenDate =
      trend.length > 0
        ? new Date(Math.max(...trend.map(d => new Date(d.date))))
            .toLocaleDateString()
        : "-";
    for (const row of byMessage) {

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";

      const msgTd = document.createElement("td");
      msgTd.textContent = row.error_message;

      const countTd = document.createElement("td");
      countTd.textContent = row.hits;

      const dateTd = document.createElement("td");
      dateTd.textContent = lastSeenDate;

      tr.appendChild(msgTd);
      tr.appendChild(countTd);
      tr.appendChild(dateTd);

      const detailTr = document.createElement("tr");
      detailTr.style.display = "none";

      const detailTd = document.createElement("td");
      detailTd.colSpan = 3;

      detailTd.style.background = "#f8f9fa";
      detailTd.style.whiteSpace = "pre-wrap";
      detailTd.style.fontFamily = "monospace";
      detailTd.style.fontSize = "12px";

      detailTd.textContent = row.error_message;

      detailTr.appendChild(detailTd);

      tr.addEventListener("click", () => {

        detailTr.style.display =
          detailTr.style.display === "none" ? "" : "none";

      });

      tbody.appendChild(tr);
      tbody.appendChild(detailTr);
    }

  } catch (error) {

    Dashboard.showError(content, error.message);

  }
};
