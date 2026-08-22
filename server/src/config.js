import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function csv(value, fallback = []) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "dev-only-insecure-secret",
  adminPassword: process.env.ADMIN_PASSWORD || "admin",

  // 事業者は一度ログインしたら再度パスワードを求めない（既定180日）
  operatorSessionDays: Number(process.env.OPERATOR_SESSION_DAYS || 180),

  // --- Lark ---
  // 通知方式: "webhook"（カスタムボット）または "app"（Lark アプリでDM送信）
  larkMode: process.env.LARK_MODE || "webhook",
  larkWebhookUrl: process.env.LARK_WEBHOOK_URL || "",
  larkWebhookSecret: process.env.LARK_WEBHOOK_SECRET || "",
  larkAppId: process.env.LARK_APP_ID || "",
  larkAppSecret: process.env.LARK_APP_SECRET || "",
  // DM送信先。receive_id_type は email / open_id / user_id など
  larkReceiveId: process.env.LARK_RECEIVE_ID || "",
  larkReceiveIdType: process.env.LARK_RECEIVE_ID_TYPE || "email",
  larkBaseUrl: process.env.LARK_BASE_URL || "https://open.larksuite.com",

  // --- 塩尻市マスタ（Googleスプレッドシート） ---
  masterSpreadsheetId: process.env.MASTER_SPREADSHEET_ID || "1w2mCb17sKs0DS6C2nKwtAffxLCnN-gvhIN-3ZAo-8kY",
  masterSheetGid: process.env.MASTER_SHEET_GID || "848607191",
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",

  // --- 試験導入スコープ（青果物：りんご・ぶどう類の取り扱い事業者） ---
  // 事業者名にこれらのいずれかを含む事業者のみ取り込む（空なら事業者名での絞り込みなし）
  targetOperators: csv(process.env.TARGET_OPERATORS, ["ベジサコ", "ファームシンセイ"]),
  // 返礼品名にこれらのいずれかを含む返礼品のみ取り込む（空なら返礼品名での絞り込みなし）
  targetProductKeywords: csv(process.env.TARGET_PRODUCT_KEYWORDS, [
    "りんご",
    "リンゴ",
    "サンふじ",
    "シナノ",
    "ぐんま名月",
    "ふじ",
    "ぶどう",
    "ブドウ",
    "シャインマスカット",
    "クイーンルージュ",
    "ナガノパープル",
    "巨峰",
    "ピオーネ",
    "デラウェア",
  ]),

  dataDir: path.join(__dirname, "..", "data"),
  webDir: path.join(__dirname, "..", "..", "web"),
};
