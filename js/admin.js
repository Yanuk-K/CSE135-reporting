window.Dashboard = window.Dashboard || {};

Dashboard.roleOptions = [
  { value: "viewer", label: "viewer" },
  { value: "admin", label: "analyst" },
  { value: "owner", label: "super admin" },
];

Dashboard.sectionOptions = ["overview", "sessions", "performance", "errors"];

Dashboard.roleLabel = function (value) {
  const match = Dashboard.roleOptions.find((option) => option.value === value);
  return match ? match.label : value;
};

Dashboard.renderAdmin = async function () {
  const content = document.getElementById("content");
  Dashboard.showLoading(content);

  try {
    const usersRes = await Dashboard.apiFetch("/api/users");
    if (!usersRes) return;
    const isOwner = sessionStorage.getItem("role") === "owner";

    content.innerHTML = `
      <section class="panel">
        <h2>Admin Panel</h2>
        <form id="create-user-form" class="admin-form">
          <input name="email" type="email" placeholder="Email" required />
          <input name="display_name" type="text" placeholder="Display Name" />
          <input name="password" type="password" placeholder="Password" required />
          <select name="role">
            ${Dashboard.roleOptions
              .map((option) => `<option value="${option.value}">${option.label}</option>`)
              .join("")}
          </select>
          <button type="submit">Add User</button>
        </form>
        <p id="admin-msg" class="status-msg"></p>
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

    const msg = document.getElementById("admin-msg");
    const tbody = document.getElementById("users-body");

    (usersRes.data || []).forEach((user) => {
      const tr = document.createElement("tr");
      const assignedSections = (() => {
        if (Array.isArray(user.sections)) return user.sections;
        if (typeof user.sections === "string") {
          if (user.sections.includes(",")) {
            return user.sections
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean);
          }
          if (user.sections.trim()) return [user.sections.trim()];
          try {
            const parsed = JSON.parse(user.sections);
            return Array.isArray(parsed) ? parsed : [];
          } catch (_) {
            return [];
          }
        }
        return [];
      })();

      const idTd = document.createElement("td");
      idTd.textContent = String(user.id);
      const emailTd = document.createElement("td");
      emailTd.textContent = user.email || "";
      const nameTd = document.createElement("td");
      nameTd.textContent = user.display_name || "";
      const roleTd = document.createElement("td");
      const roleSelect = document.createElement("select");
      Dashboard.roleOptions.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.label;
        if (user.role === option.value) opt.selected = true;
        roleSelect.appendChild(opt);
      });
      roleTd.appendChild(roleSelect);

      const loginTd = document.createElement("td");
      loginTd.textContent = user.last_login || "";

      const actionsTd = document.createElement("td");
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", async () => {
        try {
          await Dashboard.apiFetch(`/api/users/${user.id}`, {
            method: "PUT",
            body: JSON.stringify({ role: roleSelect.value }),
          });
          msg.textContent = "User updated.";
        } catch (error) {
          msg.textContent = error.message;
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm(`Delete ${user.email}?`)) return;
        try {
          await Dashboard.apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
          tr.remove();
          msg.textContent = "User deleted.";
        } catch (error) {
          msg.textContent = error.message;
        }
      });

      actionsTd.appendChild(saveBtn);
      actionsTd.appendChild(document.createTextNode(" "));
      actionsTd.appendChild(deleteBtn);

      if (isOwner && user.role === "admin") {
        const controls = document.createElement("div");
        const checkboxes = Dashboard.sectionOptions.map((section) => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = section;
          input.checked = assignedSections.includes(section);
          label.appendChild(input);
          label.appendChild(document.createTextNode(` ${section}`));
          controls.appendChild(label);
          controls.appendChild(document.createTextNode(" "));
          return input;
        });

        const saveSectionsBtn = document.createElement("button");
        saveSectionsBtn.type = "button";
        saveSectionsBtn.textContent = "Save Sections";
        saveSectionsBtn.addEventListener("click", async () => {
          const sections = checkboxes.filter((input) => input.checked).map((input) => input.value);
          try {
            await Dashboard.apiFetch(`/api/users/${user.id}/sections`, {
              method: "PUT",
              body: JSON.stringify({ sections }),
            });
            msg.textContent = "Sections updated.";
          } catch (error) {
            msg.textContent = error.message;
          }
        });

        controls.appendChild(saveSectionsBtn);
        actionsTd.appendChild(document.createElement("br"));
        actionsTd.appendChild(controls);
      }

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
        display_name: fd.get("display_name"),
        password: fd.get("password"),
        role: fd.get("role"),
      };
      try {
        await Dashboard.apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        msg.textContent = "User created.";
        Dashboard.renderAdmin();
      } catch (error) {
        msg.textContent = error.message;
      }
    });
  } catch (error) {
    Dashboard.showError(content, error.message);
  }
};
