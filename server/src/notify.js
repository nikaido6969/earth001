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
  const { municipality, operatorName, operatorId, productName, productCode, type, before, after, masterNote, requestedAt } =
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
      {
        tag: "div",
        fields: [
          { is_short: true, text: { tag: "lark_md", content: `**変更前**\n${before}` } },
          { is_short: true, text: { tag: "lark_md", content: `**変更後**\n${after}` } },
        ],
      },
      masterNote ? { tag: "div", text: { tag: "lark_md", content: `**塩尻市マスタ反映**\n${masterNote}` } } : null,
      { tag: "hr" },
      { tag: "note", elements: [{ tag: "plain_text", content: `申請日時: ${requestedAt}` }] },
    ].filter(Boolean),
  };
}

/** Slack / ログ向けのプレーンテキスト版（Larkカードと同じ内容） */
function buildChangeText(request) {
  const { municipality, operatorName, operatorId, productName, productCode, type, before, after, masterNote, requestedAt } =
    request;
  const label = CHANGE_TYPE_LABELS[type] || type;
  return [
    `*【返礼品変更申請】${label}*`,
    "",
    `> 自治体： ${municipality}`,
    `> 事業者： ${operatorName}（${operatorId}）`,
    `> 返礼品： ${productName}（${productCode}）`,
    `> 変更前： ${before}`,
    `> 変更後： ${after}`,
    `> 申請日時： ${requestedAt}`,
    masterNote ? `\n塩尻市マスタ反映： ${masterNote}` : "",
  ].filter(Boolean).join("\n");
}

function buildDigestText({ today, items, leadDays }) {
  const rows = items.map((it) => {
    const when = it.remainingDays === 0 ? "*本日*" : `${it.remainingDays}日`;
    const shipping = [it.shippingFrom, it.shippingTo].filter(Boolean).join(" 〜 ") || "未設定";
    return `| ${when} | ${it.acceptTo} | ${it.operatorName} | ${it.productName}（${it.productCode}） | ${shipping} |`;
  });
  return [
    `*【まもなく受付終了】翌年度の受付確認 ${items.length}件*`,
    "",
    `${today} 時点で、受付終了日まで *${leadDays}日以内* の先行予約・期間限定の返礼品です。`,
    "翌年度の受付開始の準備と、事業者への再掲載受付の承諾確認をお願いします。",
    "",
    "| 残り | 受付終了 | 事業者 | 返礼品 | 発送期間 |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
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

/** Slack へ送信する（Larkが未許可の環境での代替・併用チャンネル） */
async function sendViaSlack(text) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${config.slackBotToken}`,
    },
    body: JSON.stringify({ channel: config.slackChannelId, text, mrkdwn: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    console.error("[slack] 送信失敗", res.status, json);
    return { skipped: false, ok: false, mode: "slack", response: json };
  }
  return { skipped: false, ok: true, mode: "slack", ts: json.ts };
}

/** 受付終了が近い返礼品のリストを通知する */
export async function sendExpiryDigestNotification(digest) {
  return dispatch(buildDigestCard(digest), buildDigestText(digest), "受付終了間近リスト");
}

/** 変更申請内容を通知する */
export async function sendChangeNotification(request) {
  return dispatch(buildCard(request), buildChangeText(request), "変更申請");
}

/** Lark へ送る（LARK_MODE=app ならDM、webhook ならカスタムボット） */
async function sendToLark(card, label) {
  if (config.larkMode === "app") {
    if (!config.larkAppId || !config.larkAppSecret || !config.larkReceiveId) {
      console.warn(`[lark] アプリの設定が未完了のため${label}の送信をスキップしました`);
      return { skipped: true, mode: "app" };
    }
    return sendViaApp(card);
  }
  if (!config.larkWebhookUrl) {
    console.warn(`[lark] LARK_WEBHOOK_URL が未設定のため${label}の送信をスキップしました`);
    return { skipped: true, mode: "webhook" };
  }
  return sendViaWebhook(card);
}

/**
 * NOTIFY_CHANNELS で指定されたすべての宛先へ送信する。
 *
 * Larkが組織のネットワークポリシーで許可されるまでの間は slack を使い、
 * 許可され次第 `NOTIFY_CHANNELS=lark` または `lark,slack` に変えるだけで切り替えられる。
 */
async function dispatch(card, text, label) {
  const results = {};

  for (const channel of config.notifyChannels) {
    try {
      if (channel === "lark") {
        results.lark = await sendToLark(card, label);
      } else if (channel === "slack") {
        if (!config.slackBotToken || !config.slackChannelId) {
          console.warn(`[slack] SLACK_BOT_TOKEN / SLACK_CHANNEL_ID が未設定のため${label}の送信をスキップしました`);
          results.slack = { skipped: true, mode: "slack" };
        } else {
          results.slack = await sendViaSlack(text);
        }
      }
    } catch (err) {
      console.error(`[${channel}] ${label}の送信でエラー`, err);
      results[channel] = { skipped: false, ok: false, mode: channel, error: String(err) };
    }
  }

  const sent = Object.values(results).filter((r) => r.ok);
  return { channels: results, ok: sent.length > 0, skipped: sent.length === 0 };
}
