import { apiRequest, showToast } from "./api.js";
import { createDateWheelPicker, createNumberWheelPicker } from "./scrollPicker.js";

const listEl = document.getElementById("product-list");
const backdrop = document.getElementById("sheet-backdrop");
const sheetContent = document.getElementById("sheet-content");

let products = [];

async function init() {
  try {
    const me = await apiRequest("/operator/me");
    document.getElementById("operator-name").textContent = me.name;
    document.getElementById("operator-muni").textContent = `${me.municipality} ／ 事業者ID: ${me.operatorId}`;
  } catch {
    window.location.href = "/login.html";
    return;
  }
  await loadProducts();
}

async function loadProducts() {
  products = await apiRequest("/operator/products");
  renderList();
}

function fmtDate(d) {
  return d ? d : "未設定";
}

function renderList() {
  if (!products.length) {
    listEl.innerHTML = `<div class="empty-state">取り扱い返礼品がまだ登録されていません。<br>自治体担当者にお問い合わせください。</div>`;
    return;
  }

  listEl.innerHTML = products
    .map(
      (p) => `
    <div class="product-card" data-id="${p.id}">
      <div class="p-name">${escapeHtml(p.productName)}
        <span class="badge ${p.stockStatus === "paused" ? "paused" : "active"}">${p.stockStatus === "paused" ? "受付停止中" : "受付中"}</span>
      </div>
      <div class="p-code">返礼品コード: ${escapeHtml(p.productCode)}</div>

      <div class="p-meta-grid">
        <div>在庫数<strong>${p.stock}</strong></div>
        <div>商品代<strong>${p.price.toLocaleString()}円${p.pendingPrice != null ? ` → ${p.pendingPrice.toLocaleString()}円(申請中)` : ""}</strong></div>
        <div>発送期間<strong>${fmtDate(p.pendingShippingFrom || p.shippingFrom)} 〜 ${fmtDate(p.pendingShippingTo || p.shippingTo)}</strong></div>
        <div>受付期間<strong>${fmtDate(p.pendingAcceptFrom || p.acceptFrom)} 〜 ${fmtDate(p.pendingAcceptTo || p.acceptTo)}</strong></div>
      </div>
      ${p.pendingDesiredDate ? `<div class="p-code">変更希望日申請中: ${p.pendingDesiredDate}</div>` : ""}

      <div class="action-row">
        <button class="chip-btn" data-action="stock" data-id="${p.id}">在庫を増減する</button>
        <button class="chip-btn" data-action="toggle-status" data-id="${p.id}">${p.stockStatus === "paused" ? "受付を再開する" : "受付を停止する"}</button>
        <button class="chip-btn" data-action="price" data-id="${p.id}">商品代を変更する</button>
        <button class="chip-btn" data-action="desiredDate" data-id="${p.id}">変更希望日を伝える</button>
        <button class="chip-btn" data-action="shippingPeriod" data-id="${p.id}">発送期間を変更する</button>
        <button class="chip-btn" data-action="acceptPeriod" data-id="${p.id}">受付期間を変更する</button>
      </div>
    </div>
  `
    )
    .join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

listEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip-btn");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const product = products.find((p) => p.id === id);
  const action = btn.dataset.action;

  if (action === "toggle-status") {
    handleToggleStatus(product);
    return;
  }
  openSheetFor(action, product);
});

async function handleToggleStatus(product) {
  const nextAction = product.stockStatus === "paused" ? "resume" : "pause";
  const label = nextAction === "pause" ? "在庫受付を停止します。よろしいですか？" : "在庫受付を再開します。よろしいですか？";
  if (!confirm(label)) return;
  await submitChange(product.id, "stock", { action: nextAction });
}

function closeSheet() {
  backdrop.classList.add("hidden");
  sheetContent.innerHTML = "";
}

backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeSheet();
});

function openSheet(html) {
  sheetContent.innerHTML = html;
  backdrop.classList.remove("hidden");
}

function openSheetFor(action, product) {
  if (action === "stock") return sheetStockAdjust(product);
  if (action === "price") return sheetPriceChange(product);
  if (action === "desiredDate") return sheetDesiredDate(product);
  if (action === "shippingPeriod") return sheetPeriod(product, "shippingPeriod", "発送期間の変更", "shippingFrom", "shippingTo");
  if (action === "acceptPeriod") return sheetPeriod(product, "acceptPeriod", "受付期間の変更", "acceptFrom", "acceptTo");
}

function sheetStockAdjust(product) {
  openSheet(`
    <h2>在庫を増減する — ${escapeHtml(product.productName)}</h2>
    <p class="hint">現在の在庫数: ${product.stock}。スクロールして増減数を選び、決定してください。</p>
    <div id="stock-wheel"></div>
    <div class="sheet-actions">
      <button class="btn-secondary" id="cancel-btn">キャンセル</button>
      <button class="btn-primary" id="submit-btn">この内容で送信</button>
    </div>
  `);

  const picker = createNumberWheelPicker(document.getElementById("stock-wheel"), {
    min: -100,
    max: 100,
    step: 1,
    initialValue: 0,
    unit: "個",
    showSign: true,
  });

  document.getElementById("cancel-btn").onclick = closeSheet;
  document.getElementById("submit-btn").onclick = async () => {
    const delta = picker.getValue();
    if (!delta) {
      showToast("増減数を選択してください");
      return;
    }
    await submitChange(product.id, "stock", { action: "adjust", delta });
  };
}

function sheetPriceChange(product) {
  openSheet(`
    <h2>商品代を変更する — ${escapeHtml(product.productName)}</h2>
    <p class="hint">現在の商品代: ${product.price.toLocaleString()}円。万の位・百円の位をスクロールして選び、決定してください。</p>
    <div class="date-wheel-group">
      <div class="wheel-col"><div id="price-man"></div><div style="text-align:center;font-size:11px;color:#6b7570;margin-top:4px;">万円</div></div>
      <div class="wheel-col"><div id="price-hyaku"></div><div style="text-align:center;font-size:11px;color:#6b7570;margin-top:4px;">百円</div></div>
    </div>
    <div class="sheet-actions">
      <button class="btn-secondary" id="cancel-btn">キャンセル</button>
      <button class="btn-primary" id="submit-btn">この内容で送信</button>
    </div>
  `);

  const initMan = Math.floor(product.price / 10000);
  const initHyaku = Math.floor((product.price % 10000) / 100);

  const manPicker = createNumberWheelPicker(document.getElementById("price-man"), {
    min: 0, max: 50, step: 1, initialValue: Math.min(initMan, 50), unit: "",
  });
  const hyakuPicker = createNumberWheelPicker(document.getElementById("price-hyaku"), {
    min: 0, max: 99, step: 1, initialValue: initHyaku, unit: "",
  });

  document.getElementById("cancel-btn").onclick = closeSheet;
  document.getElementById("submit-btn").onclick = async () => {
    const newPrice = manPicker.getValue() * 10000 + hyakuPicker.getValue() * 100;
    if (newPrice <= 0) {
      showToast("商品代を選択してください");
      return;
    }
    await submitChange(product.id, "price", { newPrice });
  };
}

function sheetDesiredDate(product) {
  openSheet(`
    <h2>変更希望日を伝える — ${escapeHtml(product.productName)}</h2>
    <p class="hint">スクロールして年月日を選び、決定してください。※ご希望に沿えるまでお時間がかかる場合がございます。</p>
    <div id="date-wheel"></div>
    <div class="sheet-actions">
      <button class="btn-secondary" id="cancel-btn">キャンセル</button>
      <button class="btn-primary" id="submit-btn">この内容で送信</button>
    </div>
  `);

  const picker = createDateWheelPicker(document.getElementById("date-wheel"), {
    initialDate: product.pendingDesiredDate || undefined,
    yearsAhead: 2,
  });

  document.getElementById("cancel-btn").onclick = closeSheet;
  document.getElementById("submit-btn").onclick = async () => {
    await submitChange(product.id, "desiredDate", { desiredDate: picker.getIsoDate() });
  };
}

function sheetPeriod(product, type, title, fromField, toField) {
  openSheet(`
    <h2>${title} — ${escapeHtml(product.productName)}</h2>
    <p class="hint">スクロールして開始日・終了日をそれぞれ選び、決定してください。</p>
    <div style="font-size:13px;font-weight:700;margin-top:10px;">開始日</div>
    <div id="from-wheel"></div>
    <div style="font-size:13px;font-weight:700;margin-top:14px;">終了日</div>
    <div id="to-wheel"></div>
    <div class="sheet-actions">
      <button class="btn-secondary" id="cancel-btn">キャンセル</button>
      <button class="btn-primary" id="submit-btn">この内容で送信</button>
    </div>
  `);

  const fromPicker = createDateWheelPicker(document.getElementById("from-wheel"), {
    initialDate: product[`pending${cap(fromField)}`] || product[fromField] || undefined,
    yearsAhead: 2,
  });
  const toPicker = createDateWheelPicker(document.getElementById("to-wheel"), {
    initialDate: product[`pending${cap(toField)}`] || product[toField] || undefined,
    yearsAhead: 2,
  });

  document.getElementById("cancel-btn").onclick = closeSheet;
  document.getElementById("submit-btn").onclick = async () => {
    const from = fromPicker.getIsoDate();
    const to = toPicker.getIsoDate();
    if (from > to) {
      showToast("開始日は終了日より前にしてください");
      return;
    }
    const payload = {};
    payload[fromField] = from;
    payload[toField] = to;
    await submitChange(product.id, type, payload);
  };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function submitChange(productId, type, payload) {
  try {
    await apiRequest(`/operator/products/${productId}/change`, { method: "POST", body: { type, payload } });
    closeSheet();
    showToast("変更内容をLarkへ送信しました");
    await loadProducts();
  } catch (err) {
    showToast(err.message);
  }
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await apiRequest("/auth/logout", { method: "POST" });
  window.location.href = "/login.html";
});

init();
