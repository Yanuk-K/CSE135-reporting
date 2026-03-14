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
  const adminLink = document.querySelector('#main-nav a[data-route="/admin"]');
  const isOwner = sessionStorage.getItem("role") === "owner";
  const isAnalystOne =
    sessionStorage.getItem("role") === "admin" && Number(sessionStorage.getItem("user_id")) === 1;
  if (loginLink) loginLink.classList.toggle("hidden", isAuthenticated);
  if (adminLink) adminLink.classList.toggle("hidden", !isAuthenticated || (!isOwner && !isAnalystOne));
};

Dashboard.setHeaderState = function (state, isAuthenticated) {
  const isLogin = state.route === "/login";
  const canExport = isAuthenticated && Dashboard.canExport(state.route);
  const canSave = isAuthenticated && Dashboard.canSaveReport(state.route);
  document.getElementById("start-date").value = state.start;
  document.getElementById("end-date").value = state.end;
  document.getElementById("date-controls").classList.toggle("hidden", isLogin);
  document.getElementById("logout-btn").classList.toggle("hidden", !isAuthenticated);
  document.getElementById("user-label").textContent =
    isLogin ? "Guest" : (sessionStorage.getItem("display_name") || "User");
  document.getElementById("export-btn").classList.toggle("hidden", !canExport);
  document.getElementById("export-btn").disabled = !canExport;
  document.getElementById("save-report-btn").classList.toggle("hidden", !canSave);
  document.getElementById("save-report-btn").disabled = !canSave;
  Dashboard.setActiveNav(state.route);
};

Dashboard.canExport = function (route) {
  return route === "/overview" || route === "/sessions" || route === "/performance" || route === "/errors";
};

Dashboard.canSaveReport = function (route) {
  const role = sessionStorage.getItem("role");
  if (role !== "owner" && role !== "admin") return false;
  return Dashboard.canExport(route);
};

Dashboard.buildReportDocument = function (state) {
  const content = document.getElementById("content");
  const blocks = Array.from(content.querySelectorAll(".panel")).map((panel, index) => {
    const titleEl = panel.querySelector("h2, h3");
    const comment = panel.querySelector(".analyst-comment p, .analyst-note p");
    const tableRows = panel.querySelectorAll("table tbody tr").length;
    const chartCount = panel.querySelectorAll("canvas, [id*='Chart'], [id*='chart']").length;
    const type = chartCount ? "chart" : tableRows ? "table" : "text";
    return {
      id: `block-${index + 1}`,
      type,
      title: titleEl ? titleEl.textContent.trim() : `Block ${index + 1}`,
      comment: comment ? comment.textContent.trim() : "",
      html: panel.innerHTML,
    };
  });

  return {
    route: state.route,
    range: { start: state.start, end: state.end },
    blocks,
    saved_at: new Date().toISOString(),
  };
};

Dashboard.saveCurrentReport = async function () {
  const button = document.getElementById("save-report-btn");
  const state = Dashboard.parseHash(window.location.hash || "#/overview");
  if (!Dashboard.canSaveReport(state.route)) return;

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const section = state.route.replace("/", "") || "overview";
    const categoryBySection = {
      overview: "traffic",
      sessions: "behavior",
      performance: "performance",
      errors: "reliability",
    };
    const title = `${section.toUpperCase()} ${state.start} to ${state.end}`;
    await Dashboard.apiFetch("/api/reports", {
      method: "POST",
      body: JSON.stringify({
        title,
        section_key: section,
        category: categoryBySection[section] || section,
        report_json: Dashboard.buildReportDocument(state),
        is_published: false,
      }),
    });
    button.textContent = "Saved";
  } catch (error) {
    Dashboard.showError(document.getElementById("content"), error.message);
    button.textContent = "Save Report";
    button.disabled = false;
    return;
  }

  setTimeout(() => {
    button.textContent = "Save Report";
    button.disabled = false;
  }, 900);
};

Dashboard.captureElementImage = async function (element, label) {
  if (!element || !window.html2canvas) return null;

  const canvas = await window.html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 1,
    useCORS: true,
    logging: false,
  });

  return {
    label,
    data_url: canvas.toDataURL("image/jpeg", 0.72),
  };
};

Dashboard.collectExportScreenshots = async function (route) {
  const content = document.getElementById("content");
  if (!content) return [];
  const screenshot = await Dashboard.captureElementImage(
    content,
    `${route.replace("/", "").toUpperCase() || "REPORT"} Dashboard`
  );
  return screenshot ? [screenshot] : [];
};

Dashboard.exportCurrentReport = async function () {
  const button = document.getElementById("export-btn");
  const state = Dashboard.parseHash(window.location.hash || "#/overview");
  if (!Dashboard.canExport(state.route)) return;

  button.disabled = true;
  button.textContent = "Exporting...";

  try {
    const screenshots = await Dashboard.collectExportScreenshots(state.route);
    const res = await Dashboard.apiFetch("/api/exports/report", {
      method: "POST",
      body: JSON.stringify({
        route: state.route,
        start: state.start,
        end: state.end,
        screenshot_images: screenshots,
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
  if (state.route === "/sessions") {
    await Dashboard.renderSessions(state.start, state.end);
    return;
  }
  if (state.route === "/errors") {
    await Dashboard.renderErrors(state.start, state.end);
    return;
  }
  if (state.route === "/admin") {
    const isOwner = sessionStorage.getItem("role") === "owner";
    const isAnalystOne =
      sessionStorage.getItem("role") === "admin" && Number(sessionStorage.getItem("user_id")) === 1;
    if (!isOwner && !isAnalystOne) {
      Dashboard.setHash("/overview", state.start, state.end);
      return;
    }
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
document.getElementById("save-report-btn").addEventListener("click", Dashboard.saveCurrentReport);
document.getElementById("menu-btn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

window.addEventListener("hashchange", Dashboard.route);

if (!window.location.hash) {
  Dashboard.setHash("/overview", Dashboard.defaultStart(), Dashboard.defaultEnd());
} else {
  Dashboard.route();
}
