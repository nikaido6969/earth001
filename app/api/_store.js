import crypto from "node:crypto";

export const SECRET = process.env.APP_SECRET || "shiojiri-trial-secret-change-in-production";
export const SESSION_DAYS = 180;

/** パスワードのハッシュ化（依存パッケージなしで動かすため scrypt を使う） */
export function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

export function verifyPassword(password, salt, expected) {
  const actual = hashPassword(password, salt);
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 署名付きトークンを発行する（一度ログインしたら再度パスワードを求めないよう長期有効） */
export function signToken(payload) {
  const body = { ...payload, exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 };
  const data = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- 事業者アカウント ---
// 試験運用のため、塩尻市マスタから抽出した事業者にIDを発行して同梱している。
// 本番では塩尻市マスタから自動発行し、パスワードハッシュはデータベースに保存する。
const SALT = "shiojiri-trial";

const ACCOUNTS = [
  { operatorId: "TEST01", name: "テスト事業者（二階堂）", password: "DFLNEWG5" },
  { operatorId: "SJR001", name: "株式会社ベジサコ", password: "3PCDW726" },
  { operatorId: "SJR002", name: "上條農園", password: "EM2B8T8S" },
  { operatorId: "SJR003", name: "有限会社 野村農場（米）", password: "9L34ASKF" },
  { operatorId: "SJR004", name: "株式会社アクアファームくるめ", password: "Y43VX9ZV" },
  { operatorId: "SJR005", name: "生産者直売所 アルプス市場", password: "PRSGT929" },
];

export const OPERATORS = ACCOUNTS.map((a) => ({
  operatorId: a.operatorId,
  name: a.name,
  municipality: "塩尻市",
  salt: SALT,
  passwordHash: hashPassword(a.password, SALT),
}));

// --- 返礼品データ（塩尻市マスタ「返礼品マスタ」から抽出した実データ） ---
function p(operatorId, productCode, productName, price, stock, shippingFrom, shippingTo, acceptFrom, acceptTo) {
  return { operatorId, productCode, productName, price, stock, stockStatus: "active", shippingFrom, shippingTo, acceptFrom, acceptTo };
}

const VEGISACO = [
  ["G01", "デラウェア 5〜7房", 4500, 30, "2026-08-01", "2026-08-31", "2026-06-01", "2026-08-25"],
  ["G03", "クイーンルージュ（2房）", 5500, 40, "2026-09-10", "2026-10-10", "2026-06-01", "2026-08-22"],
  ["G04-2411", "シャインマスカット 2房", 5000, 50, "2026-09-01", "2026-10-20", "2026-06-01", "2026-08-27"],
  ["G06-2411", "種なし巨峰 2房", 4500, 35, "2026-09-01", "2026-09-30", "2026-06-01", "2026-08-29"],
  ["G07R611", "南水 5kg", 4500, 40, "2026-09-20", "2026-10-20", "2026-06-01", "2026-08-24"],
  ["G09", "サンふじ・シナノゴールド", 5000, 60, "2026-11-20", "2026-12-25", "2026-08-01", "2026-11-30"],
  ["G10R6", "シナノスイート", 4500, 55, "2026-10-05", "2026-11-05", "2026-08-01", "2026-10-25"],
  ["G11R6", "ぐんま名月", 4800, 25, "2026-10-25", "2026-11-25", "2026-08-01", "2026-11-15"],
  ["G12R6", "シナノゴールド", 4500, 45, "2026-11-01", "2026-12-01", "2026-08-01", "2026-11-20"],
  ["G13R611", "サンふじ", 4500, 80, "2026-11-20", "2026-12-25", "2026-08-01", "2026-08-28"],
  ["G17", "ピオーネ", 5000, 20, "2026-09-05", "2026-10-05", "2026-06-01", "2026-09-25"],
  ["G19", "豊水", 4000, 30, "2026-08-25", "2026-09-20", "2026-06-01", "2026-09-10"],
  ["G20", "幸水", 4000, 30, "2026-08-10", "2026-09-05", "2026-06-01", "2026-08-30"],
  ["G21", "ナガノパープル", 6000, 20, "2026-09-05", "2026-10-05", "2026-06-01", "2026-08-30"],
  ["G22", "旬のおまかせりんご（シナノゴールド・シナノスイート・ぐんま名月）", 5000, 40, "2026-10-10", "2026-11-30", "2026-08-01", "2026-11-20"],
];

export const PRODUCTS = [
  // テスト用（二階堂さん）: ベジサコの品目をコピーし、自由に操作しても実運用に影響しないようにしている
  ...VEGISACO.map((r) => p("TEST01", ...r)),
  ...VEGISACO.map((r) => p("SJR001", ...r)),
  p("SJR002", "B01", "ながいも 5kg", 4000, 60, "", "", "2026-08-01", "2027-03-31"),
  p("SJR002", "B04", "長野県産 コシヒカリ 2kg （無洗米） 長芋 3kg のセット", 4000, 100, "", "", "2026-08-01", "2027-03-31"),
  p("SJR003", "N01", "白米 約5kg", 4000, 120, "", "", "2026-08-01", "2027-03-31"),
  p("SJR003", "N02", "白米 約10kg（約5kg×2袋）", 7500, 80, "", "", "2026-08-01", "2027-03-31"),
  p("SJR003", "N03", "玄米", 4000, 50, "", "", "2026-08-01", "2027-03-31"),
  p("SJR004", "Q01", "塩尻市産 シャインマスカット1.8kg", 5000, 40, "2026-09-01", "2026-10-15", "2026-06-01", "2026-08-26"),
  p("SJR004", "Q02", "【家庭用】塩尻市産 家庭用シャインマスカット1.8kg(2房〜5房）", 4500, 35, "2026-09-01", "2026-10-15", "2026-06-01", "2026-08-26"),
  p("SJR005", "A01", "おまかせ野菜セット 2〜3人前", 3000, 25, "", "", "2026-08-01", "2027-03-31"),
  p("SJR005", "A02", "【ご家庭用】シャインマスカットの入ったお任せぶどうセット", 4500, 30, "2026-09-30", "2026-10-20", "2026-06-01", "2026-08-23"),
  p("SJR005", "A03", "【ご家庭用】シャインマスカット 2kg", 5000, 20, "2026-09-30", "2026-10-20", "2026-06-01", "2026-08-23"),
].map((x, i) => ({ id: i + 1, ...x }));

/**
 * 変更申請の保存先。
 * 試験運用のためサーバー側はメモリ保持とし、端末側でも localStorage に保持して表示する。
 * 本番では塩尻市マスタ（Googleスプレッドシート）へ直接反映する。
 */
export const CHANGES = [];
