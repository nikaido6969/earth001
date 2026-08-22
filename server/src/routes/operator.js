import { Router } from "express";
import { operatorsStore, productsStore, changeRequestsStore, nextId } from "../db.js";
import { requireOperatorAuth } from "../middleware/auth.js";
import { sendChangeNotification } from "../notify.js";
import { applyChangeToMaster } from "../sheets.js";

export const operatorRouter = Router();
operatorRouter.use(requireOperatorAuth);

const CHANGE_TYPES = ["stock", "price", "desiredDate", "shippingPeriod", "acceptPeriod"];

operatorRouter.get("/me", (req, res) => {
  const operators = operatorsStore.read();
  const operator = operators.find((o) => o.id === req.operator.id);
  if (!operator) return res.status(404).json({ error: "事業者が見つかりません" });
  res.json({ id: operator.id, operatorId: operator.operatorId, name: operator.name, municipality: operator.municipality });
});

operatorRouter.get("/products", (req, res) => {
  const products = productsStore.read().filter((p) => p.operatorId === req.operator.id);
  res.json(products);
});

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

const period = (from, to) => `${from || "未設定"} 〜 ${to || "未設定"}`;

/**
 * 変更の「変更前」「変更後」を組み立てる。
 * 通知には変更後だけでなく変更前も載せる（担当者が差分を確認できるようにするため）。
 * product は呼び出し元で変更後の値に更新済みのため、変更前は before 用の値を別途受け取る。
 */
function buildDiff(type, payload, prev) {
  switch (type) {
    case "stock": {
      if (payload.action === "pause") return { before: prev.stockStatus === "paused" ? "停止" : "受付中", after: "停止" };
      if (payload.action === "resume") return { before: prev.stockStatus === "paused" ? "停止" : "受付中", after: "受付中" };
      const sign = payload.delta > 0 ? "+" : "";
      return {
        before: `${prev.stock}`,
        after: `${payload.newStock}（${sign}${payload.delta}）`,
      };
    }
    case "price":
      return { before: `${prev.price.toLocaleString()}円`, after: `${payload.newPrice.toLocaleString()}円` };
    case "desiredDate":
      return { before: "—", after: `${payload.desiredDate}（お時間がかかる場合がございます）` };
    case "shippingPeriod":
      return {
        before: period(prev.shippingFrom, prev.shippingTo),
        after: period(payload.shippingFrom, payload.shippingTo),
      };
    case "acceptPeriod":
      return { before: period(prev.acceptFrom, prev.acceptTo), after: period(payload.acceptFrom, payload.acceptTo) };
    default:
      return { before: "", after: "" };
  }
}

operatorRouter.post("/products/:id/change", async (req, res) => {
  const productId = Number(req.params.id);
  const { type, payload } = req.body || {};

  if (!CHANGE_TYPES.includes(type)) {
    return res.status(400).json({ error: "不正な変更種別です" });
  }

  const products = productsStore.read();
  const product = products.find((p) => p.id === productId && p.operatorId === req.operator.id);
  if (!product) return res.status(404).json({ error: "返礼品が見つかりません" });

  // 通知に「変更前」を載せるため、更新する前の値を控えておく
  const prev = { ...product };

  // --- バリデーションと即時反映（画面上の現在値として表示するため） ---
  if (type === "stock") {
    if (payload.action === "pause") {
      product.stockStatus = "paused";
    } else if (payload.action === "resume") {
      product.stockStatus = "active";
    } else if (payload.action === "adjust") {
      const delta = Number(payload.delta);
      if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "増減数が不正です" });
      const newStock = Math.max(0, product.stock + delta);
      payload.newStock = newStock;
      product.stock = newStock;
    } else {
      return res.status(400).json({ error: "不正な在庫操作です" });
    }
  } else if (type === "price") {
    const newPrice = Number(payload.newPrice);
    if (!Number.isFinite(newPrice) || newPrice < 0) return res.status(400).json({ error: "商品代が不正です" });
    payload.oldPrice = product.price;
    product.pendingPrice = newPrice; // 実マスタへの反映はLark連絡を受けた担当者が実施
  } else if (type === "desiredDate") {
    if (!isValidDate(payload.desiredDate)) return res.status(400).json({ error: "変更希望日が不正です" });
    product.pendingDesiredDate = payload.desiredDate;
  } else if (type === "shippingPeriod") {
    if (!isValidDate(payload.shippingFrom) || !isValidDate(payload.shippingTo)) {
      return res.status(400).json({ error: "発送期間の日付が不正です" });
    }
    if (payload.shippingFrom > payload.shippingTo) {
      return res.status(400).json({ error: "発送開始日は終了日より前にしてください" });
    }
    product.pendingShippingFrom = payload.shippingFrom;
    product.pendingShippingTo = payload.shippingTo;
  } else if (type === "acceptPeriod") {
    if (!isValidDate(payload.acceptFrom) || !isValidDate(payload.acceptTo)) {
      return res.status(400).json({ error: "受付期間の日付が不正です" });
    }
    if (payload.acceptFrom > payload.acceptTo) {
      return res.status(400).json({ error: "受付開始日は終了日より前にしてください" });
    }
    product.pendingAcceptFrom = payload.acceptFrom;
    product.pendingAcceptTo = payload.acceptTo;
  }

  product.updatedAt = new Date().toISOString();
  productsStore.write(products);

  const operators = operatorsStore.read();
  const operator = operators.find((o) => o.id === req.operator.id);

  const { before, after } = buildDiff(type, payload, prev);
  const requestedAt = new Date().toISOString();

  const changeRequests = changeRequestsStore.read();
  const changeRequest = {
    id: nextId(changeRequests),
    operatorId: operator.id,
    productId: product.id,
    type,
    payload,
    before,
    after,
    status: "notified",
    requestedAt,
  };
  changeRequests.push(changeRequest);
  changeRequestsStore.write(changeRequests);

  // 送信と同時に塩尻市マスタへ反映（該当セルを黄色で塗り、C列備考に更新前の値と変更内容を記載）
  let sheetResult = { skipped: true };
  try {
    sheetResult = await applyChangeToMaster({ type, payload, product, operatorName: operator.name });
  } catch (err) {
    console.error("[operator] 塩尻市マスタ更新エラー", err);
    sheetResult = { skipped: false, ok: false, error: err.message };
  }

  const masterNote = sheetResult.skipped
    ? "未反映（マスタ連携が未設定）"
    : sheetResult.ok
      ? `${sheetResult.sheetTitle} ${sheetResult.row}行目を更新（${sheetResult.updatedColumns.join(", ") || "備考のみ"}）`
      : `反映失敗: ${sheetResult.error}`;

  let notifyResult = { skipped: true };
  try {
    notifyResult = await sendChangeNotification({
      municipality: operator.municipality,
      operatorName: operator.name,
      operatorId: operator.operatorId,
      productName: product.productName,
      productCode: product.productCode,
      type,
      before,
      after,
      masterNote,
      requestedAt: new Date(requestedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
    });
  } catch (err) {
    console.error("[operator] 通知エラー", err);
    notifyResult = { skipped: false, ok: false, error: String(err) };
  }

  changeRequest.masterSync = sheetResult;
  changeRequestsStore.write(changeRequests);

  res.json({ ok: true, product, changeRequest, notify: notifyResult, master: sheetResult });
});

operatorRouter.get("/change-requests", (req, res) => {
  const list = changeRequestsStore
    .read()
    .filter((c) => c.operatorId === req.operator.id)
    .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  res.json(list);
});
