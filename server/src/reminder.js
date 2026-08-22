import { config } from "./config.js";
import { operatorsStore, productsStore } from "./db.js";
import { sendLarkExpiryDigest } from "./lark.js";

/** 日本時間の「今日」を YYYY-MM-DD で返す */
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/** 申請中の値があればそれを、なければマスタの値を使う */
function effective(product, field) {
  const pending = product[`pending${field.charAt(0).toUpperCase()}${field.slice(1)}`];
  return pending || product[field] || null;
}

/**
 * 先行予約・期間限定の返礼品（＝発送期間に記載がある返礼品）のうち、
 * 受付終了日まで残り reminderLeadDays 日以内のものを抽出する。
 *
 * 翌年の受付開始準備と、事業者への再掲載承諾の確認のために毎日通知する。
 */
export function findExpiringProducts(today = todayJst()) {
  const operators = operatorsStore.read();
  const products = productsStore.read();
  const lead = config.reminderLeadDays;

  const items = [];

  for (const product of products) {
    // 先行予約・期間限定商品の判定: 発送期間に記載があること
    const shippingFrom = effective(product, "shippingFrom");
    const shippingTo = effective(product, "shippingTo");
    if (!shippingFrom && !shippingTo) continue;

    const acceptTo = effective(product, "acceptTo");
    if (!acceptTo) continue;

    const remaining = daysBetween(today, acceptTo);
    // 受付終了日の1週間前から受付終了日当日まで
    if (remaining < 0 || remaining > lead) continue;

    const operator = operators.find((o) => o.id === product.operatorId);

    items.push({
      operatorName: operator?.name || "(不明な事業者)",
      operatorId: operator?.operatorId || "-",
      productCode: product.productCode,
      productName: product.productName,
      acceptFrom: effective(product, "acceptFrom"),
      acceptTo,
      shippingFrom,
      shippingTo,
      remainingDays: remaining,
    });
  }

  // 受付終了が近いものから順に並べる
  items.sort((a, b) => a.remainingDays - b.remainingDays || a.operatorName.localeCompare(b.operatorName));
  return items;
}

/**
 * 受付終了が近い返礼品のリストをLarkへ通知する。
 * 対象が0件の日は通知しない。
 */
export async function sendExpiryDigest(today = todayJst()) {
  const items = findExpiringProducts(today);
  if (!items.length) {
    console.log(`[reminder] ${today}: 受付終了が近い返礼品はありません`);
    return { sent: false, count: 0, items };
  }

  const result = await sendLarkExpiryDigest({ today, items, leadDays: config.reminderLeadDays });
  console.log(`[reminder] ${today}: ${items.length}件を通知しました`, result);
  return { sent: true, count: items.length, items, lark: result };
}

/**
 * 毎日 reminderHourJst 時（日本時間）に一度だけ通知するスケジューラを起動する。
 * サーバー再起動をまたいでも二重送信しないよう、送信済みの日付を記録する。
 */
export function startReminderScheduler() {
  if (!config.reminderEnabled) {
    console.log("[reminder] REMINDER_ENABLED=false のためリマインドを無効化しました");
    return;
  }

  let lastSentDate = null;

  const tick = async () => {
    const now = new Date();
    const jstHour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false }).format(now)
    );
    const today = todayJst(now);

    if (jstHour !== config.reminderHourJst || lastSentDate === today) return;

    lastSentDate = today;
    try {
      await sendExpiryDigest(today);
    } catch (err) {
      console.error("[reminder] 通知に失敗しました", err);
    }
  };

  // 10分ごとに時刻を確認する
  setInterval(tick, 10 * 60 * 1000);
  tick();

  console.log(
    `[reminder] 受付終了${config.reminderLeadDays}日前から毎日 ${config.reminderHourJst}時(JST)に通知します`
  );
}
