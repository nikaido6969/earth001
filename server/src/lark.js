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

function buildCard(request) {
  const { municipality, operatorName, operatorId, productName, productCode, type, summary, masterNote, requestedAt } =
    request;
  const label = CHANGE_TYPE_LABELS[type] || type;

  return {
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
      masterNote ? { tag: "div", text: { tag: "lark_md", content: `**塩尻市マスタ反映**\n${masterNote}` } } : null,
      { tag: "hr" },
      { tag: "note", elements: [{ tag: "plain_text", content: `申請日時: ${requestedAt}` }] },
    ].filter(Boolean),
  };
}

async function sendViaWebhook(card) {
  const body = { msg_type: "interactive", card };

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
    console.error("[lark] webhook送信失敗", res.status, json);
    return { skipped: false, ok: false, mode: "webhook", response: json };
  }
  return { skipped: false, ok: true, mode: "webhook" };
}

async function getTenantAccessToken() {
  const res = await fetch(`${config.larkBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.larkAppId, app_secret: config.larkAppSecret }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`Larkトークン取得に失敗: ${json.msg}`);
  return json.tenant_access_token;
}

/** Lark アプリ経由で個人（例: 二階堂さん）へDM送信する */
async function sendViaApp(card) {
  const token = await getTenantAccessToken();
  const url = `${config.larkBaseUrl}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(
    config.larkReceiveIdType
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      receive_id: config.larkReceiveId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 0) {
    console.error("[lark] DM送信失敗", res.status, json);
    return { skipped: false, ok: false, mode: "app", response: json };
  }
  return { skipped: false, ok: true, mode: "app" };
}

function buildDigestCard({ today, items, leadDays }) {
  const lines = items.map((it) => {
    const when = it.remainingDays === 0 ? "**本日が受付終了日**" : `残り **${it.remainingDays}日**`;
    const shipping = [it.shippingFrom, it.shippingTo].filter(Boolean).join(" 〜 ") || "未設定";
    return [
      `**${it.productName}**（${it.productCode}）`,
      `事業者: ${it.operatorName}`,
      `受付終了: ${it.acceptTo}（${when}）`,
      `発送期間: ${shipping}`,
    ].join("\n");
  });

  return {
    header: {
      title: { tag: "plain_text", content: `【受付終了間近】先行予約・期間限定 ${items.length}件` },
      template: "orange",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content:
            `${today} 時点で、受付終了日まで **${leadDays}日以内** の先行予約・期間限定の返礼品です。\n` +
            "翌年の受付開始準備と、事業者への再掲載受付の承諾確認をお願いします。",
        },
      },
      { tag: "hr" },
      ...lines.flatMap((content, i) => [
        { tag: "div", text: { tag: "lark_md", content } },
        i < lines.length - 1 ? { tag: "hr" } : null,
      ]).filter(Boolean),
    ],
  };
}

/** 受付終了が近い返礼品のリストをLarkへ通知する */
export async function sendLarkExpiryDigest(digest) {
  const card = buildDigestCard(digest);
  return dispatch(card, "受付終了間近リスト");
}

/**
 * 変更申請内容をLarkへ送信する。
 * LARK_MODE=app なら指定ユーザーへDM（試験運用: 二階堂さん宛）、
 * LARK_MODE=webhook ならカスタムボットのWebhook（本番: 塩尻市グループ）へ送る。
 * 設定が未完了の場合は送信をスキップする。
 */
export async function sendLarkChangeNotification(request) {
  return dispatch(buildCard(request), "変更申請");
}

/** 設定に応じて DM / Webhook のいずれかで送信する */
async function dispatch(card, label) {
  if (config.larkMode === "app") {
    if (!config.larkAppId || !config.larkAppSecret || !config.larkReceiveId) {
      console.warn(`[lark] アプリの設定が未完了のため${label}の送信をスキップしました`);
      return { skipped: true };
    }
    return sendViaApp(card);
  }

  if (!config.larkWebhookUrl) {
    console.warn(`[lark] LARK_WEBHOOK_URL が未設定のため${label}の送信をスキップしました`);
    return { skipped: true };
  }
  return sendViaWebhook(card);
}
