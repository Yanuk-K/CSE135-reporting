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
  document.getElementById("start-date").value = state.start;
  document.getElementById("end-date").value = state.end;
  document.getElementById("date-controls").classList.toggle("hidden", isLogin);
  document.getElementById("logout-btn").classList.toggle("hidden", !isAuthenticated);
  document.getElementById("user-label").textContent =
    isLogin ? "Guest" : (sessionStorage.getItem("display_name") || "User");
  Dashboard.setActiveNav(state.route);
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
document.getElementById("menu-btn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

window.addEventListener("hashchange", Dashboard.route);

if (!window.location.hash) {
  Dashboard.setHash("/overview", Dashboard.defaultStart(), Dashboard.defaultEnd());
} else {
  Dashboard.route();
}
