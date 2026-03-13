window.Dashboard = window.Dashboard || {};

Dashboard.getAuthState = async function (state) {
  try {
    const res = await fetch(`/api/dashboard?start=${state.start}&end=${state.end}`, {
      credentials: "include",
    });
    return res.ok;
  } catch (_) {
    return false;
  }
};

Dashboard.setAuthUI = function (isAuthenticated) {
  const loginLink = document.querySelector('#main-nav a[data-route="/login"]');
  if (loginLink) loginLink.classList.toggle("hidden", isAuthenticated);
};

Dashboard.setHeaderState = function (state, isAuthenticated) {
  const isLogin = state.route === "/login";
  const canExport = isAuthenticated && Dashboard.canExport(state.route);
  document.getElementById("start-date").value = state.start;
  document.getElementById("end-date").value = state.end;
  document.getElementById("date-controls").classList.toggle("hidden", isLogin);
  document.getElementById("logout-btn").classList.toggle("hidden", !isAuthenticated);
  document.getElementById("user-label").textContent =
    isLogin ? "Guest" : (sessionStorage.getItem("display_name") || "User");
  document.getElementById("export-btn").classList.toggle("hidden", !canExport);
  document.getElementById("export-btn").disabled = !canExport;
  Dashboard.setActiveNav(state.route);
};

Dashboard.canExport = function (route) {
  return route === "/overview" || route === "/performance" || route === "/errors";
};

Dashboard.getCanvasImage = function (id, label) {
  const canvas = document.getElementById(id);
  if (!canvas || !canvas.width || !canvas.height) return null;
  return {
    label,
    data_url: canvas.toDataURL("image/png"),
  };
};

Dashboard.getZingChartImage = function (id, label) {
  if (!window.zingchart || !document.getElementById(id)) return null;

  try {
    const imageData = zingchart.exec(id, "getimagedata", {
      download: false,
      filetype: "png",
    });
    const dataUrl =
      typeof imageData === "string"
        ? imageData
        : imageData?.data || imageData?.image || imageData?.imagedata || imageData?.dataurl;
    if (!dataUrl) return null;
    return {
      label,
      data_url: dataUrl,
    };
  } catch (_) {
    return null;
  }
};

Dashboard.collectExportCharts = function (route) {
  const charts = [];

  if (route === "/overview") {
    const chart = Dashboard.getCanvasImage("chart", "Pageviews Trend");
    if (chart) charts.push(chart);
  }
  if (route === "/performance") {
    const chart = Dashboard.getCanvasImage("perf-chart", "Performance Metrics");
    if (chart) charts.push(chart);
  }
  if (route === "/errors") {
    const chart = Dashboard.getZingChartImage("errorTrendChart", "Errors Trend");
    if (chart) charts.push(chart);
  }

  return charts;
};

Dashboard.exportCurrentReport = async function () {
  const button = document.getElementById("export-btn");
  const state = Dashboard.parseHash(window.location.hash || "#/overview");
  if (!Dashboard.canExport(state.route)) return;

  button.disabled = true;
  button.textContent = "Exporting...";

  try {
    const res = await Dashboard.apiFetch("/api/exports/report", {
      method: "POST",
      body: JSON.stringify({
        route: state.route,
        start: state.start,
        end: state.end,
        chart_images: Dashboard.collectExportCharts(state.route),
      }),
    });
    if (!res) return;
    window.open(res.data.url, "_blank", "noopener");
  } catch (error) {
    Dashboard.showError(document.getElementById("content"), error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Export PDF";
  }
};

Dashboard.route = async function () {
  const state = Dashboard.parseHash(window.location.hash || "#/overview");
  const isAuthenticated = await Dashboard.getAuthState(state);
  Dashboard.setAuthUI(isAuthenticated);
  Dashboard.setHeaderState(state, isAuthenticated);
  document.getElementById("sidebar").classList.remove("open");

  if (state.route === "/login") {
    if (isAuthenticated) {
      Dashboard.setHash("/overview", state.start, state.end);
      return;
    }
    Dashboard.renderLogin();
    return;
  }

  if (!isAuthenticated) {
    Dashboard.setHash("/login");
    return;
  }

  if (state.route === "/overview") {
    await Dashboard.renderOverview();
    return;
  }
  if (state.route === "/performance") {
    await Dashboard.renderPerformance(state.start, state.end);
    return;
  }
  if (state.route === "/errors") {
    await Dashboard.renderErrors(state.start, state.end);
    return;
  }
  if (state.route === "/admin") {
    await Dashboard.renderAdmin();
    return;
  }

  Dashboard.setHash("/overview", state.start, state.end);
};

document.getElementById("apply-dates").addEventListener("click", () => {
  const state = Dashboard.parseHash(window.location.hash || "#/overview");
  if (state.route === "/login") return;

  const start = document.getElementById("start-date").value;
  const end = document.getElementById("end-date").value;
  if (!start || !end || start > end) {
    Dashboard.showError(document.getElementById("content"), "Invalid date range");
    return;
  }
  Dashboard.setHash(state.route, start, end);
});

document.getElementById("logout-btn").addEventListener("click", Dashboard.logout);
document.getElementById("export-btn").addEventListener("click", Dashboard.exportCurrentReport);
document.getElementById("menu-btn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

window.addEventListener("hashchange", Dashboard.route);

if (!window.location.hash) {
  Dashboard.setHash("/overview", Dashboard.defaultStart(), Dashboard.defaultEnd());
} else {
  Dashboard.route();
}
