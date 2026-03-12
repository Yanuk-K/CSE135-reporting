// Parse hash: #/overview?start=2026-01-01&end=2026-01-31
function parseHash(hash) {
    const [path, query] = hash.replace('#', '').split('?');
    const params = new URLSearchParams(query || '');
    return {
        route: path || '/overview',
        start: params.get('start') || defaultStart(),
        end:   params.get('end')   || defaultEnd()
    };
}
function defaultStart() {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
}
function defaultEnd() {
    return new Date().toISOString().slice(0, 10);
}
function setHash(route, start, end) {
  const params = new URLSearchParams({ start, end });
  window.location.hash = `#${route}?${params.toString()}`;
}
function showError(container, message) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'error-box';
  box.textContent = message;
  container.appendChild(box);
}
function showLoading(container) {
    container.innerHTML = `
        <div class="skeleton-cards">
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        </div>
        <div class="skeleton-chart"></div>
    `;
}
async function loadOverview(start, end) {
    const content = document.getElementById('content');
    showLoading(content);
    try {
        const res = await fetch(`/api/overview?start=${start}&end=${end}`);
        if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
        const data = await res.json();
        renderOverview(content, data);
    } catch (err) {
        showError(content, err.message);
    }
}
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    window.location.hash = "#/login";
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}
function buildPageRow(page) {
    const tr = document.createElement('tr');
    const urlCell = document.createElement('td');
    urlCell.textContent = page.url;     // safe: never innerHTML
    tr.appendChild(urlCell);
    const viewsCell = document.createElement('td');
    viewsCell.textContent = page.views; // safe: numeric, but still use textContent
    tr.appendChild(viewsCell);
    return tr;
}
function renderOverview(content, apiResponse) {
  const payload = apiResponse && apiResponse.data ? apiResponse.data : {};
  const summary = payload.summary || {};
  const topPages = payload.top_pages || [];
  content.innerHTML = `
    <section class="panel">
      <h2>Overview</h2>
      <div class="summary-cards">
        <div class="summary-card">
          <strong>Total Pageviews</strong>
          <div>${summary.total_pageviews || 0}</div>
        </div>
        <div class="summary-card">
          <strong>Total Sessions</strong>
          <div>${summary.total_sessions || 0}</div>
        </div>
        <div class="summary-card">
          <strong>Average Load Time</strong>
          <div>${summary.average_load_time == null ? 'n/a' : summary.average_load_time}</div>
        </div>
        <div class="summary-card">
          <strong>Total Errors</strong>
          <div>${summary.total_errors || 0}</div>
        </div>
      </div>
    </section>
    <section class="panel table-wrapper">
      <h3>Top Pages</h3>
      <table>
        <thead>
          <tr><th>URL</th><th>Views</th></tr>
        </thead>
        <tbody id="top-pages-body"></tbody>
      </table>
    </section>
  `;
  const data = { topPages: topPages };
  // Build the table body safely:
  const tbody = document.getElementById('top-pages-body');
  tbody.innerHTML = '';  // clear previous rows (safe: no user data)
  data.topPages.forEach(page => {
      tbody.appendChild(buildPageRow(page));
  });
}
async function renderPerformance(start, end) {
  const content = document.getElementById('content');
  showLoading(content);
  try {
    const data = await apiFetch(`/api/performance?start=${start}&end=${end}`);
    if (!data) return;
    content.innerHTML = `<section class="panel"><h2>Performance</h2><pre></pre></section>`;
    content.querySelector('pre').textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    showError(content, err.message);
  }
}
async function renderErrors(start, end) {
  const content = document.getElementById('content');
  showLoading(content);
  try {
    const data = await apiFetch(`/api/errors?start=${start}&end=${end}`);
    if (!data) return;
    content.innerHTML = `<section class="panel"><h2>Errors</h2><pre></pre></section>`;
    content.querySelector('pre').textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    showError(content, err.message);
  }
}
async function renderAdmin() {
  const content = document.getElementById("content");
  showLoading(content);
  try {
    const usersRes = await apiFetch("/api/users");
    if (!usersRes) return;
    content.innerHTML = `
      <section class="panel">
        <h2>Admin Panel</h2>
        <form id="create-user-form">
          <input name="email" type="email" placeholder="Email" required />
          <input name="password" type="password" placeholder="Password" required />
          <input name="display_name" type="text" placeholder="Display name" />
          <select name="role">
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>
          <button type="submit">Create User</button>
        </form>
        <p id="admin-msg"></p>
      </section>
      <section class="panel table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Email</th><th>Name</th><th>Role</th><th>Last Login</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="users-body"></tbody>
        </table>
      </section>
    `;
    const tbody = document.getElementById("users-body");
    const msg = document.getElementById("admin-msg");
    (usersRes.data || []).forEach((user) => {
      const tr = document.createElement("tr");
      const idTd = document.createElement("td");
      idTd.textContent = user.id;
      const emailTd = document.createElement("td");
      emailTd.textContent = user.email;
      const nameTd = document.createElement("td");
      nameTd.textContent = user.display_name || "";
      const roleTd = document.createElement("td");
      const roleSelect = document.createElement("select");
      ["viewer", "admin", "owner"].forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r;
        if (user.role === r) opt.selected = true;
        roleSelect.appendChild(opt);
      });
      roleTd.appendChild(roleSelect);
      const loginTd = document.createElement("td");
      loginTd.textContent = user.last_login || "";
      const actionsTd = document.createElement("td");
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Save Role";
      saveBtn.addEventListener("click", async () => {
        try {
          await apiFetch(`/api/users/${user.id}`, {
            method: "PUT",
            body: JSON.stringify({ role: roleSelect.value })
          });
          msg.textContent = "Role updated.";
        } catch (err) {
          msg.textContent = err.message;
        }
      });
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Delete ${user.email}?`)) return;
        try {
          await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
          tr.remove();
          msg.textContent = "User deleted.";
        } catch (err) {
          msg.textContent = err.message;
        }
      });
      actionsTd.appendChild(saveBtn);
      actionsTd.appendChild(document.createTextNode(" "));
      actionsTd.appendChild(delBtn);
      tr.appendChild(idTd);
      tr.appendChild(emailTd);
      tr.appendChild(nameTd);
      tr.appendChild(roleTd);
      tr.appendChild(loginTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
    document.getElementById("create-user-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        email: fd.get("email"),
        password: fd.get("password"),
        display_name: fd.get("display_name"),
        role: fd.get("role")
      };
      try {
        await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        msg.textContent = "User created. Refreshing...";
        await renderAdmin();
      } catch (err) {
        msg.textContent = err.message;
      }
    });
  } catch (err) {
    showError(content, err.message);
  }
}
function renderLogin() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <section class="panel">
      <h2>Login</h2>
      <form id="login-form">
        <p><label>Email <input id="email" type="email" required></label></p>
        <p><label>Password <input id="password" type="password" required></label></p>
        <button type="submit">Login</button>
      </form>
      <div id="login-error" class="error-box" style="display:none;"></div>
    </section>
  `;
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errBox = document.getElementById('login-error');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error(`Login failed (${res.status})`);
      const data = await res.json();
      if (data && data.token) localStorage.setItem('token', data.token);
      setHash('/overview', defaultStart(), defaultEnd());
    } catch (err) {
      errBox.style.display = 'block';
      errBox.textContent = err.message;
    }
  });
}
async function route() {
  const state = parseHash(window.location.hash || '#/overview');
  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  startInput.value = state.start;
  endInput.value = state.end;
  if (state.route === '/login') {
    renderLogin();
    return;
  }
  if (state.route === '/overview') {
    await loadOverview(state.start, state.end);
    return;
  }
  if (state.route === '/performance') {
    await renderPerformance(state.start, state.end);
    return;
  }
  if (state.route === '/errors') {
    await renderErrors(state.start, state.end);
    return;
  }
  if (state.route === '/admin') {
    await renderAdmin();
    return;
  }
  setHash('/overview', state.start, state.end);
}
document.getElementById('apply-dates').addEventListener('click', () => {
  const state = parseHash(window.location.hash || '#/overview');
  const start = document.getElementById('start-date').value;
  const end = document.getElementById('end-date').value;
  if (!start || !end || start > end) {
    showError(document.getElementById('content'), 'Invalid date range');
    return;
  }
  setHash(state.route, start, end);
});
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (_) {}
  localStorage.removeItem('token');
  window.location.hash = '#/login';
});
document.getElementById('menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});
window.addEventListener('hashchange', route);
if (!window.location.hash) {
  setHash('/overview', defaultStart(), defaultEnd());
} else {
  route();
}