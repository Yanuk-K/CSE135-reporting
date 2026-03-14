window.Dashboard = window.Dashboard || {};

Dashboard.apiFetch = async function (url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    Dashboard.setHash("/login");
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }
  return data;
};

Dashboard.checkAuth = async function () {
  const state = Dashboard.parseHash(window.location.hash || "#/overview");
  if (state.route === "/login") return true;
  const data = await Dashboard.apiFetch(`/api/dashboard?start=${state.start}&end=${state.end}`);
  return Boolean(data);
};

Dashboard.renderLogin = function () {
  const content = document.getElementById("content");
  content.innerHTML = `
    <section class="login-wrap">
      <form id="login-form" class="login-card">
        <h2>Analytics Dashboard</h2>
        <label for="email">Email</label>
        <input id="email" type="email" required autocomplete="email" />
        <label for="password">Password</label>
        <input id="password" type="password" required autocomplete="current-password" />
        <div id="login-error" class="error-box hidden"></div>
        <button type="submit">Sign In</button>
      </form>
    </section>
  `;

  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const err = document.getElementById("login-error");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Login failed");

      const displayName = (data.data && data.data.display_name) || email;
      sessionStorage.setItem("display_name", displayName);
      sessionStorage.setItem("role", (data.data && data.data.role) || "viewer");
      Dashboard.setHash("/overview", Dashboard.defaultStart(), Dashboard.defaultEnd());
    } catch (error) {
      err.classList.remove("hidden");
      err.textContent = error.message;
    }
  });
};

Dashboard.logout = async function () {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
  } catch (_) {
  }
  sessionStorage.removeItem("display_name");
  sessionStorage.removeItem("role");
  Dashboard.setHash("/login");
};
