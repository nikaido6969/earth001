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

  // --- 試験導入スコープ（青果物および米） ---
  // 返礼品名にこれらのいずれかを含む返礼品を対象とする。
  // 対象返礼品を1件以上持つ事業者が、自動的に対象事業者になる。
  targetProductKeywords: csv(process.env.TARGET_PRODUCT_KEYWORDS, [
    // りんご
    "りんご", "リンゴ", "林檎", "サンふじ", "サンフジ", "ふじ", "シナノ", "ぐんま名月",
    "秋映", "王林", "紅玉", "トキ", "北斗",
    // ぶどう
    "ぶどう", "ブドウ", "葡萄", "シャインマスカット", "クイーンルージュ", "ナガノパープル",
    "巨峰", "ピオーネ", "デラウェア", "マスカット", "サニードルチェ", "クイーンニーナ",
    // 梨
    "梨", "南水", "幸水", "豊水", "二十世紀", "秋月", "あきづき", "ラ・フランス", "ラフランス",
    // その他果物
    "桃", "もも", "モモ", "ネクタリン", "プルーン", "すもも", "スモモ", "ブルーベリー",
    "さくらんぼ", "サクランボ", "いちご", "イチゴ", "苺", "柿", "メロン", "スイカ", "キウイ",
    // 野菜
    "野菜", "トマト", "とうもろこし", "トウモロコシ", "アスパラ", "きのこ", "キノコ",
    "しめじ", "えのき", "きゅうり", "なす", "ナス", "レタス", "白菜", "キャベツ",
    "じゃがいも", "ジャガイモ", "玉ねぎ", "玉葱", "たまねぎ", "長芋", "ながいも", "山芋",
    "大根", "人参", "にんじん", "ねぎ", "ほうれん草", "ブロッコリー", "かぼちゃ", "枝豆",
    // 米
    "米", "コシヒカリ", "こしひかり", "あきたこまち", "風さやか", "ミルキークイーン",
    "ゆめしなの", "精米", "玄米", "無洗米",
  ]),
  // 加工品を除外する（青果物ではないため）。
  // 例:「信州りんごジュース」「純米大吟醸」「マスカットベリーA ワイン」は対象外。
  excludeProductKeywords: csv(process.env.EXCLUDE_PRODUCT_KEYWORDS, [
    // 酒類
    "ワイン", "ワイナリー", "日本酒", "純米", "吟醸", "本醸造", "醸造", "焼酎", "ビール",
    "シードル", "リキュール", "発泡", "スパークリング", "梅酒", "酒", "ヌーボー", "樽熟",
    // 飲料・加工食品
    "ジュース", "スムージー", "ドリンク", "サイダー", "コーヒー", "紅茶", "茶",
    "ジャム", "ゼリー", "コンポート", "ピューレ", "ソース", "ドレッシング", "酢", "味噌",
    "麹", "米粉", "パン", "菓子", "クッキー", "ケーキ", "パイ", "タルト", "アイス",
    "シャーベット", "せんべい", "チップ", "ドライ", "乾燥", "缶詰", "瓶詰", "漬物", "漬け",
    "加工", "レトルト", "カレー", "スープ", "飲み比べ",
    // 麺・粉類
    "麺", "そば", "蕎麦", "うどん", "パスタ", "粉", "干し",
    // 調味料・その他（青果物以外の詰め合わせを除外）
    "醤油", "しょうゆ", "たれ", "つゆ", "卵", "たまご", "玉子",
    // 精肉・加工肉（「りんご和牛」など、名前に果物名を含むブランド牛を除外）
    "和牛", "牛", "豚", "鶏", "肉", "ロース", "ステーキ", "すき焼き", "しゃぶしゃぶ",
    "切り落とし", "ハム", "ソーセージ", "ベーコン", "馬刺",
    // ワイン用ぶどう品種（生食用ではないため）。全角ハイフン表記のゆれにも対応
    "ベーリー", "ベリーA", "ベ-リ-", "ベーリ", "フロムファーム",
  ]),
  // 対象事業者を明示的に限定したい場合のみ設定する（部分一致・カンマ区切り）。
  // 空の場合は、上記キーワードに該当する返礼品を持つ事業者すべてが対象になる。
  targetOperators: csv(process.env.TARGET_OPERATORS, []),

  // --- 受付終了前リマインド ---
  // 受付終了日の何日前から毎日通知するか
  reminderLeadDays: Number(process.env.REMINDER_LEAD_DAYS || 7),
  // 毎日の通知時刻（日本時間の時。0-23）
  reminderHourJst: Number(process.env.REMINDER_HOUR_JST || 9),
  reminderEnabled: process.env.REMINDER_ENABLED !== "false",

  dataDir: path.join(__dirname, "..", "data"),
  webDir: path.join(__dirname, "..", "..", "web"),
};
