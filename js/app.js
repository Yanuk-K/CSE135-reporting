window.Dashboard = window.Dashboard || {};

Dashboard.viewModeBySection = Dashboard.viewModeBySection || {};
Dashboard.currentSectionData = Dashboard.currentSectionData || {};
Dashboard.reportBuilderState = Dashboard.reportBuilderState || {};
Dashboard.chartInstances = Dashboard.chartInstances || new Map();
Dashboard.chartPalette = [
  "#003f5c",
  "#2f4b7c",
  "#665191",
  "#a05195",
  "#d45087",
  "#f95d6a",
  "#ff7c43",
  "#ffa600",
];

Dashboard.getPaletteColor = function (index) {
  const palette = Dashboard.chartPalette;
  return palette[((index % palette.length) + palette.length) % palette.length];
};

Dashboard.getSpreadPalette = function (count) {
  const total = Number(count || 0);
  if (total <= 0) return [];
  if (total === 1) return [Dashboard.getPaletteColor(0)];

  const paletteSize = Dashboard.chartPalette.length;
  if (total <= paletteSize) {
    return Array.from({ length: total }, (_, i) => {
      const idx = Math.round((i * (paletteSize - 1)) / (total - 1));
      return Dashboard.getPaletteColor(idx);
    });
  }

  return Array.from({ length: total }, (_, i) => Dashboard.getPaletteColor(i));
};

Dashboard.defaultPresentationBySection = {
  overview: {
    enabledBlocks: {
      cards: true,
      trendChart: true,
      topPagesChart: true,
      topPagesTable: true,
      comment: true,
    },
    chartTypes: { "overview-trend": "line", "overview-top-pages": "bar" },
  },
  sessions: {
    enabledBlocks: {
      cards: true,
      sessionsTrend: true,
      sessionsDepth: true,
      sessionsBounce: true,
      sessionsTable: true,
      comment: true,
    },
    chartTypes: {
      "sessions-trend": "line",
      "sessions-depth": "bar",
      "sessions-bounce": "doughnut",
    },
  },
  performance: {
    enabledBlocks: {
      perfPercentiles: true,
      perfComparison: true,
      perfTable: true,
      comment: true,
    },
    chartTypes: { "perf-percentiles": "bar", "perf-radar": "radar" },
  },
  errors: {
    enabledBlocks: {
      cards: true,
      errorTrend: true,
      errorTop: true,
      errorTable: true,
      comment: true,
    },
    chartTypes: { "errors-trend": "line", "errors-top": "bar" },
  },
};

Dashboard.cloneObject = function (value) {
  return JSON.parse(JSON.stringify(value));
};

Dashboard.getReportPresentation = function (section) {
  if (!section || !Dashboard.defaultPresentationBySection[section]) {
    return {
      enabledBlocks: {},
      chartTypes: {},
    };
  }
  if (!Dashboard.reportBuilderState[section]) {
    Dashboard.reportBuilderState[section] = Dashboard.cloneObject(Dashboard.defaultPresentationBySection[section]);
  }
  const presentation = Dashboard.reportBuilderState[section];
  if (!presentation.enabledBlocks) {
    const defaults = Dashboard.defaultPresentationBySection[section]?.enabledBlocks || {};
    const include = presentation.include || {};
    presentation.enabledBlocks = {};
    Object.keys(defaults).forEach((key) => {
      let fallback = true;
      if (key === "comment") fallback = include.comments !== false;
      else if (key.toLowerCase().includes("table")) fallback = include.table !== false;
      else if (key.toLowerCase().includes("card")) fallback = include.cards !== false;
      else fallback = include.charts !== false;
      presentation.enabledBlocks[key] = fallback;
    });
  }
  return Dashboard.reportBuilderState[section];
};

Dashboard.isBlockEnabled = function (section, presentation, blockKey, fallbackGroup) {
  if (presentation?.enabledBlocks && Object.prototype.hasOwnProperty.call(presentation.enabledBlocks, blockKey)) {
    return presentation.enabledBlocks[blockKey] !== false;
  }
  if (presentation?.include && fallbackGroup && Object.prototype.hasOwnProperty.call(presentation.include, fallbackGroup)) {
    return presentation.include[fallbackGroup] !== false;
  }
  const defaults = Dashboard.defaultPresentationBySection[section]?.enabledBlocks || {};
  if (Object.prototype.hasOwnProperty.call(defaults, blockKey)) {
    return defaults[blockKey] !== false;
  }
  return true;
};

Dashboard.updateReportPresentation = function (section, updater) {
  const current = Dashboard.getReportPresentation(section);
  updater(current);
};

Dashboard.bindPresentationControl = function (section, id, applyChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", () => {
    Dashboard.updateReportPresentation(section, applyChange.bind(null, el));
    Dashboard.route();
  });
};

Dashboard.destroyManagedCharts = function () {
  Dashboard.chartInstances.forEach((chart) => {
    if (chart && typeof chart.destroy === "function") chart.destroy();
  });
  Dashboard.chartInstances.clear();
};

Dashboard.renderManagedChart = function (canvas, config, key) {
  if (!canvas || typeof Chart === "undefined") return null;
  const chartKey = key || canvas.id;
  if (chartKey && Dashboard.chartInstances.has(chartKey)) {
    const existing = Dashboard.chartInstances.get(chartKey);
    if (existing && typeof existing.destroy === "function") existing.destroy();
    Dashboard.chartInstances.delete(chartKey);
  }

  const mergedConfig = {
    ...config,
    options: {
      responsive: true,
      ...(config.options || {}),
    },
  };

  const chartType = String(mergedConfig.type || "line").toLowerCase();
  if (mergedConfig.options.maintainAspectRatio == null) {
    mergedConfig.options.maintainAspectRatio = false;
  }

  const isCircularChart = ["doughnut", "pie", "polararea"].includes(chartType);
  const wrap = canvas.parentElement;
  if (wrap && wrap.classList) {
    wrap.classList.toggle("chart-wrap-square", isCircularChart);
  }

  if (mergedConfig.data && Array.isArray(mergedConfig.data.datasets)) {
    const datasetCount = mergedConfig.data.datasets.length;
    const datasetColors = Dashboard.getSpreadPalette(datasetCount);
    mergedConfig.data.datasets = mergedConfig.data.datasets.map((dataset, index) => {
      const next = { ...dataset };
      const datasetColor = datasetColors[index] || Dashboard.getPaletteColor(index);
      const pointCount = Array.isArray(next.data) ? next.data.length : 0;
      const pointColors = Dashboard.getSpreadPalette(pointCount);
      const usePointPalette = chartType === "bar" && datasetCount === 1 && pointCount > 1;

      if (next.backgroundColor == null) {
        if (["doughnut", "pie", "polararea"].includes(chartType)) {
          next.backgroundColor = pointColors;
        } else if (usePointPalette) {
          next.backgroundColor = pointColors;
        } else {
          next.backgroundColor = datasetColor;
        }
      }
      if (next.borderColor == null) {
        next.borderColor = usePointPalette ? pointColors : datasetColor;
      }
      if (next.pointBackgroundColor == null) {
        next.pointBackgroundColor = datasetColor;
      }
      return next;
    });
  }

  const chart = new Chart(canvas, mergedConfig);
  if (chartKey) Dashboard.chartInstances.set(chartKey, chart);
  return chart;
};

Dashboard.getRole = function () {
  return sessionStorage.getItem("role") || "viewer";
};

Dashboard.routeToSection = function (route) {
  const section = String(route || "").replace("/", "");
  return ["overview", "sessions", "performance", "errors"].includes(section) ? section : null;
};

Dashboard.canToggleViewMode = function (route) {
  return ["owner", "admin"].includes(Dashboard.getRole()) && Boolean(Dashboard.routeToSection(route));
};

Dashboard.getSectionMode = function (section) {
  if (!section) return "live";
  if (Dashboard.getRole() === "viewer") return "saved";
  if (!Dashboard.viewModeBySection[section]) Dashboard.viewModeBySection[section] = "live";
  return Dashboard.viewModeBySection[section];
};

Dashboard.toggleCurrentViewMode = function () {
  const state = Dashboard.parseHash(window.location.hash || "#/overview");
  const section = Dashboard.routeToSection(state.route);
  if (!section || !Dashboard.canToggleViewMode(state.route)) return;
  Dashboard.viewModeBySection[section] = Dashboard.getSectionMode(section) === "saved" ? "live" : "saved";
  Dashboard.route();
};

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
  const section = Dashboard.routeToSection(state.route);
  const canExport = isAuthenticated && Dashboard.canExport(state.route);
  const canSave = isAuthenticated && Dashboard.canSaveReport(state.route);
  const canToggleViewMode = isAuthenticated && Dashboard.canToggleViewMode(state.route);
  const viewModeBtn = document.getElementById("view-mode-btn");
  const exportBtn = document.getElementById("export-btn");
  document.getElementById("start-date").value = state.start;
  document.getElementById("end-date").value = state.end;
  document.getElementById("date-controls").classList.toggle("hidden", isLogin);
  document.getElementById("logout-btn").classList.toggle("hidden", !isAuthenticated);
  document.getElementById("user-label").textContent =
    isLogin ? "Guest" : (sessionStorage.getItem("display_name") || "User");
  if (exportBtn) {
    exportBtn.classList.toggle("hidden", !canExport);
    exportBtn.disabled = !canExport;
  }
  document.getElementById("save-report-btn").classList.toggle("hidden", !canSave);
  document.getElementById("save-report-btn").disabled = !canSave;
  viewModeBtn.classList.toggle("hidden", !canToggleViewMode);
  viewModeBtn.disabled = !canToggleViewMode;
  if (canToggleViewMode && section) {
    viewModeBtn.textContent = Dashboard.getSectionMode(section) === "saved" ? "View Live Data" : "View Saved Report";
  }
  Dashboard.setActiveNav(state.route);
};

Dashboard.canExport = function (route) {
  const role = Dashboard.getRole();
  if (role !== "owner" && role !== "admin") return false;
  return route === "/overview" || route === "/sessions" || route === "/performance" || route === "/errors";
};

Dashboard.canSaveReport = function (route) {
  const role = sessionStorage.getItem("role");
  if (role !== "owner" && role !== "admin") return false;
  const section = Dashboard.routeToSection(route);
  if (section && Dashboard.getSectionMode(section) === "saved") return false;
  return Dashboard.canExport(route);
};

Dashboard.buildReportDocument = function (state) {
  const content = document.getElementById("content");
  const blocks = Array.from(content.querySelectorAll(".panel")).map((panel, index) => {
    const titleEl = panel.querySelector("h2, h3");
    const comment = panel.querySelector(".analyst-comment-input, .analyst-comment p, .analyst-note p");
    const tableRows = panel.querySelectorAll("table tbody tr").length;
    const chartCount = panel.querySelectorAll("canvas, [id*='Chart'], [id*='chart']").length;
    const type = chartCount ? "chart" : tableRows ? "table" : "text";
    return {
      id: `block-${index + 1}`,
      type,
      title: titleEl ? titleEl.textContent.trim() : `Block ${index + 1}`,
      comment: Dashboard.getCommentValue ? Dashboard.getCommentValue(comment) : (comment ? comment.textContent.trim() : ""),
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
    const presentation = Dashboard.getReportPresentation(section);
    const categoryBySection = {
      overview: "traffic",
      sessions: "behavior",
      performance: "performance",
      errors: "performance",
    };
    const title = `${section.toUpperCase()} ${state.start} to ${state.end}`;
    const screenshots = await Dashboard.collectExportScreenshots(state.route);
    if (!screenshots.length) {
      throw new Error("Unable to capture report screenshot");
    }
    const snapshot = Dashboard.currentSectionData[section];
    if (!snapshot) {
      throw new Error("No live section snapshot available to save. Switch to live view and reload this section.");
    }
    const reportJson = Dashboard.buildReportDocument(state);
    reportJson.snapshot = {
      ...snapshot,
      section,
      range: { start: state.start, end: state.end },
      saved_at: new Date().toISOString(),
    };
    reportJson.presentation = Dashboard.cloneObject(presentation);

    await Dashboard.apiFetch("/api/reports", {
      method: "POST",
      body: JSON.stringify({
        title,
        section_key: section,
        category: categoryBySection[section] || "performance",
        report_json: reportJson,
        screenshot_images: screenshots,
        is_published: true,
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

  const captureId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  element.setAttribute("data-export-capture-id", captureId);

  let canvas;
  try {
    canvas = await window.html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 1.5,
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        const clonedTarget = clonedDoc.querySelector(`[data-export-capture-id="${captureId}"]`);
        if (!clonedTarget) return;
        clonedTarget.style.width = "720px";
        clonedTarget.style.maxWidth = "720px";
        clonedTarget.style.margin = "0 auto";
        clonedTarget.classList.add("export-capture");
        clonedTarget.querySelectorAll(".report-builder-panel").forEach((node) => {
          node.remove();
        });
      },
    });
  } finally {
    element.removeAttribute("data-export-capture-id");
  }

  return {
    label,
    data_url: canvas.toDataURL("image/png"),
  };
};

Dashboard.collectExportScreenshots = async function (route) {
  const content = document.getElementById("content");
  if (!content) return [];

  const panels = Array.from(content.querySelectorAll(".panel")).filter((panel) => {
    if (panel.classList.contains("report-builder-panel")) return false;
    if (panel.classList.contains("hidden")) return false;
    const style = window.getComputedStyle(panel);
    return style.display !== "none" && style.visibility !== "hidden";
  });

  const screenshots = [];
  for (let i = 0; i < panels.length; i += 1) {
    const panel = panels[i];
    const title = panel.querySelector("h2, h3, h4")?.textContent?.trim() || `Panel ${i + 1}`;
    const shot = await Dashboard.captureElementImage(panel, title);
    if (shot) screenshots.push(shot);
  }

  if (screenshots.length) return screenshots;

  const fallback = await Dashboard.captureElementImage(
    content,
    `${route.replace("/", "").toUpperCase() || "REPORT"} Dashboard`
  );
  return fallback ? [fallback] : [];
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
  Dashboard.destroyManagedCharts();
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

  const section = Dashboard.routeToSection(state.route);
  if (section && Dashboard.getSectionMode(section) === "saved") {
    await Dashboard.renderSavedPublishedSection(section);
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
const exportBtn = document.getElementById("export-btn");
if (exportBtn) {
  exportBtn.addEventListener("click", Dashboard.exportCurrentReport);
}
document.getElementById("save-report-btn").addEventListener("click", Dashboard.saveCurrentReport);
document.getElementById("view-mode-btn").addEventListener("click", Dashboard.toggleCurrentViewMode);
document.getElementById("menu-btn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

window.addEventListener("hashchange", Dashboard.route);

if (!window.location.hash) {
  Dashboard.setHash("/overview", Dashboard.defaultStart(), Dashboard.defaultEnd());
} else {
  Dashboard.route();
}
