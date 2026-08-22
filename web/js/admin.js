import { apiRequest, showToast } from "./api.js";

const loginPanel = document.getElementById("login-panel");
const adminPanel = document.getElementById("admin-panel");

async function checkAuth() {
  try {
    await apiRequest("/admin/operators");
    showPanel();
  } catch {
    loginPanel.style.display = "block";
    adminPanel.style.display = "none";
  }
}

function showPanel() {
  loginPanel.style.display = "none";
  adminPanel.style.display = "block";
  loadOperators();
}

document.getElementById("admin-login-btn").addEventListener("click", async () => {
  const password = document.getElementById("admin-password").value;
  const errEl = document.getElementById("admin-error");
  errEl.textContent = "";
  try {
    await apiRequest("/admin/login", { method: "POST", body: { password } });
    showPanel();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await apiRequest("/admin/logout", { method: "POST" });
  window.location.reload();
});

document.getElementById("import-btn").addEventListener("click", async () => {
  const fileInput = document.getElementById("master-file");
  const municipality = document.getElementById("municipality").value.trim() || "塩尻市";
  const errEl = document.getElementById("import-error");
  const resultEl = document.getElementById("import-result");
  errEl.textContent = "";
  resultEl.innerHTML = "";

  if (!fileInput.files.length) {
    errEl.textContent = "ファイルを選択してください";
    return;
  }

  const fd = new FormData();
  fd.append("file", fileInput.files[0]);
  fd.append("municipality", municipality);

  try {
    const res = await apiRequest("/admin/import-master", { method: "POST", body: fd, isForm: true });
    resultEl.innerHTML = `
      <p style="font-size:13px;">取込完了: 対象事業者 ${res.totalOperators} 件（新規発行 ${res.operatorsCreated.length} 件 / 更新 ${res.operatorsUpdated.length} 件）</p>
      ${res.operatorsCreated
        .map(
          (o) => `<div class="credential-box">新規発行: <strong>${o.name}</strong><br>事業者ID: <strong>${o.operatorId}</strong> ／ パスワード: <strong>${o.password}</strong>（返礼品 ${o.productCount}件）<br>この情報は再表示されません。事業者へ安全な方法で通知してください。</div>`
        )
        .join("")}
    `;
    showToast("マスタを取り込みました");
    loadOperators();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

async function loadOperators() {
  const operators = await apiRequest("/admin/operators");
  const wrap = document.getElementById("operators-wrap");
  if (!operators.length) {
    wrap.innerHTML = `<div class="empty-state">まだ事業者が登録されていません</div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>事業者ID</th><th>事業者名</th><th>自治体</th><th>返礼品数</th><th>状態</th><th></th></tr>
      </thead>
      <tbody>
        ${operators
          .map(
            (o) => `
          <tr>
            <td>${o.operatorId}</td>
            <td>${escapeHtml(o.name)}</td>
            <td>${escapeHtml(o.municipality)}</td>
            <td>${o.productCount}</td>
            <td>${o.active ? "有効" : "停止中"}</td>
            <td>
              <button class="btn-secondary" style="margin:2px 0;" data-reset="${o.id}">PW再発行</button>
              <button class="btn-secondary" style="margin:2px 0;" data-toggle="${o.id}">${o.active ? "停止" : "再開"}</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.reset;
      const res = await apiRequest(`/admin/operators/${id}/reset-password`, { method: "POST" });
      alert(`新しいパスワード: ${res.password}\n（この画面を閉じると再表示できません）`);
    });
  });

  wrap.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.toggle;
      await apiRequest(`/admin/operators/${id}/toggle-active`, { method: "POST" });
      loadOperators();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

checkAuth();
