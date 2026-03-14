window.Dashboard = window.Dashboard || {};

Dashboard.defaultStart = function () {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

Dashboard.defaultEnd = function () {
  return new Date().toISOString().slice(0, 10);
};

Dashboard.parseHash = function (hash) {
  const clean = (hash || "#/overview").replace("#", "");
  const pieces = clean.split("?");
  const path = pieces[0] || "/overview";
  const params = new URLSearchParams(pieces[1] || "");
  return {
    route: path,
    start: params.get("start") || Dashboard.defaultStart(),
    end: params.get("end") || Dashboard.defaultEnd(),
  };
};

Dashboard.setHash = function (route, start, end) {
  if (route === "/login") {
    window.location.hash = "#/login";
    return;
  }
  const params = new URLSearchParams({
    start: start || Dashboard.defaultStart(),
    end: end || Dashboard.defaultEnd(),
  });
  window.location.hash = `#${route || "/overview"}?${params.toString()}`;
};

Dashboard.showError = function (container, message) {
  container.innerHTML = "";
  const div = document.createElement("div");
  div.className = "error-box";
  div.textContent = message;
  container.appendChild(div);
};

Dashboard.showLoading = function (container) {
  container.innerHTML = `
    <section class="panel">
      <div class="skeleton-cards">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
      <div class="skeleton-chart"></div>
    </section>
  `;
};

Dashboard.setActiveNav = function (route) {
  document.querySelectorAll("#main-nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === route);
  });
};

Dashboard.canEditComments = function () {
  const role = sessionStorage.getItem("role");
  return role === "owner" || role === "admin";
};
