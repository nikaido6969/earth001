import { PRODUCTS, CHANGES, verifyToken } from "./_store.js";

const LABELS = {
  stock: "在庫調整",
  price: "商品代変更",
  desiredDate: "変更希望日",
  shippingPeriod: "発送期間変更",
  acceptPeriod: "受付期間変更",
};

function isDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ error: "ログインが必要です" });

  const { productId, type, payload } = req.body || {};
  if (!LABELS[type]) return res.status(400).json({ error: "不正な変更種別です" });

  const product = PRODUCTS.find((p) => p.id === Number(productId) && p.operatorId === session.operatorId);
  if (!product) return res.status(404).json({ error: "返礼品が見つかりません" });

  let before = "";
  let after = "";

  if (type === "stock") {
    if (payload.action === "pause") {
      before = product.stockStatus === "paused" ? "停止" : "受付中";
      after = "停止";
    } else if (payload.action === "resume") {
      before = product.stockStatus === "paused" ? "停止" : "受付中";
      after = "受付中";
    } else {
      const delta = Number(payload.delta);
      if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "増減数を選択してください" });
      const newStock = Math.max(0, product.stock + delta);
      before = String(product.stock);
      after = `${newStock}（${delta > 0 ? "+" : ""}${delta}）`;
    }
  } else if (type === "price") {
    const newPrice = Number(payload.newPrice);
    if (!Number.isFinite(newPrice) || newPrice <= 0) return res.status(400).json({ error: "商品代を選択してください" });
    before = `${product.price.toLocaleString()}円`;
    after = `${newPrice.toLocaleString()}円`;
  } else if (type === "desiredDate") {
    if (!isDate(payload.desiredDate)) return res.status(400).json({ error: "変更希望日が不正です" });
    before = "—";
    after = `${payload.desiredDate}（お時間がかかる場合がございます）`;
  } else if (type === "shippingPeriod") {
    if (!isDate(payload.from) || !isDate(payload.to)) return res.status(400).json({ error: "日付が不正です" });
    if (payload.from > payload.to) return res.status(400).json({ error: "開始日は終了日より前にしてください" });
    before = `${product.shippingFrom || "未設定"} 〜 ${product.shippingTo || "未設定"}`;
    after = `${payload.from} 〜 ${payload.to}`;
  } else if (type === "acceptPeriod") {
    if (!isDate(payload.from) || !isDate(payload.to)) return res.status(400).json({ error: "日付が不正です" });
    if (payload.from > payload.to) return res.status(400).json({ error: "開始日は終了日より前にしてください" });
    before = `${product.acceptFrom || "未設定"} 〜 ${product.acceptTo || "未設定"}`;
    after = `${payload.from} 〜 ${payload.to}`;
  }

  const requestedAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const record = {
    id: CHANGES.length + 1,
    operatorId: session.operatorId,
    operatorName: session.name,
    municipality: session.municipality,
    productCode: product.productCode,
    productName: product.productName,
    type,
    typeLabel: LABELS[type],
    before,
    after,
    requestedAt,
    // 本番で通知先（Slack/Lark）へ送る内容
    notifyMessage:
      `【返礼品変更申請】${LABELS[type]}\n` +
      `自治体: ${session.municipality}\n` +
      `事業者: ${session.name}（${session.operatorId}）\n` +
      `返礼品: ${product.productName}（${product.productCode}）\n` +
      `変更前: ${before}\n` +
      `変更後: ${after}\n` +
      `申請日時: ${requestedAt}`,
  };

  CHANGES.push(record);

  res.status(200).json({ ok: true, change: record });
}
