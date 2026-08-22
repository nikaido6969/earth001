import crypto from "node:crypto";
import { config } from "./config.js";

const CHANGE_TYPE_LABELS = {
  stock: "在庫調整",
  price: "商品代変更",
  desiredDate: "変更希望日",
  shippingPeriod: "発送期間変更",
  acceptPeriod: "受付期間変更",
};

function signature(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac("sha256", stringToSign);
  hmac.update("");
  return hmac.digest("base64");
}

function buildCardBody(request) {
  const { municipality, operatorName, operatorId, productName, productCode, type, summary, detail, requestedAt } = request;
  const label = CHANGE_TYPE_LABELS[type] || type;

  return {
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: `【返礼品変更申請】${label}` },
        template: "blue",
      },
      elements: [
        {
          tag: "div",
          fields: [
            { is_short: true, text: { tag: "lark_md", content: `**自治体**\n${municipality}` } },
            { is_short: true, text: { tag: "lark_md", content: `**事業者**\n${operatorName}（${operatorId}）` } },
            { is_short: true, text: { tag: "lark_md", content: `**返礼品**\n${productName}（${productCode}）` } },
            { is_short: true, text: { tag: "lark_md", content: `**変更種別**\n${label}` } },
          ],
        },
        { tag: "hr" },
        { tag: "div", text: { tag: "lark_md", content: `**変更内容**\n${summary}` } },
        detail ? { tag: "div", text: { tag: "lark_md", content: `**詳細**\n${detail}` } } : null,
        { tag: "hr" },
        { tag: "note", elements: [{ tag: "plain_text", content: `申請日時: ${requestedAt}` }] },
      ].filter(Boolean),
    },
  };
}

/**
 * Larkカスタムボットへ変更申請内容を送信する。
 * LARK_WEBHOOK_URL が未設定の場合は送信をスキップし、その旨を返す（開発・オフライン環境向け）。
 */
export async function sendLarkChangeNotification(request) {
  if (!config.larkWebhookUrl) {
    console.warn("[lark] LARK_WEBHOOK_URL が未設定のため送信をスキップしました");
    return { skipped: true };
  }

  const body = buildCardBody(request);

  if (config.larkWebhookSecret) {
    const timestamp = Math.floor(Date.now() / 1000);
    body.timestamp = String(timestamp);
    body.sign = signature(timestamp, config.larkWebhookSecret);
  }

  const res = await fetch(config.larkWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code) {
    console.error("[lark] 送信失敗", res.status, json);
    return { skipped: false, ok: false, response: json };
  }
  return { skipped: false, ok: true, response: json };
}
