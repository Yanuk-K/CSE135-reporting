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

Dashboard.captureElementImage = async function (element, label) {
  if (!element || !window.html2canvas) return null;

  const canvas = await window.html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
  });

  return {
    label,
    data_url: canvas.toDataURL("image/png"),
  };
};

Dashboard.collectExportScreenshots = async function (route) {
  const content = document.getElementById("content");
  if (!content) return [];

  let elements;
  if (route === "/overview") {
    elements = [
      document.getElementById("cards"),
      document.getElementById("chart"),
      document.getElementById("top-pages"),
    ];
  } else {
    elements = Array.from(content.children);
  }

  const visibleElements = elements.filter(
    (element) => element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
  );

  const screenshots = [];
  for (const [index, element] of visibleElements.entries()) {
    const screenshot = await Dashboard.captureElementImage(
      element,
      `${route.replace("/", "").toUpperCase() || "REPORT"} Section ${index + 1}`
    );
    if (screenshot) screenshots.push(screenshot);
  }

  return screenshots;
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
