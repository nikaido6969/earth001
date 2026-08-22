import { google } from "googleapis";
import { config } from "./config.js";

/**
 * 塩尻市マスタ「返礼品マスタ」シートの列マッピング（0始まりのインデックス）。
 * 実シートのヘッダー行と一致することを確認済み。
 */
export const COLUMNS = {
  remarks: 2, // C 備考
  productCode: 15, // P アース商品コード
  stock: 19, // T 在庫数
  operator: 20, // U 事業者
  productName: 21, // V 返礼品名
  settlement: 24, // Y 精算額（商品代）
  shippingFrom: 30, // AE 発送期間 開始
  shippingTo: 31, // AF 発送期間 終了
};

const YELLOW = { red: 1, green: 1, blue: 0.6 };

function columnLetter(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function getClient() {
  if (!config.googleServiceAccountJson) return null;
  let credentials;
  try {
    credentials = JSON.parse(config.googleServiceAccountJson);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON のJSONが不正です");
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function getSheetMeta(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.masterSpreadsheetId });
  const sheet =
    meta.data.sheets.find((s) => String(s.properties.sheetId) === String(config.masterSheetGid)) ||
    meta.data.sheets.find((s) => /返礼品マスタ/.test(s.properties.title));
  if (!sheet) throw new Error("返礼品マスタのシートが見つかりません");
  return { sheetId: sheet.properties.sheetId, title: sheet.properties.title };
}

/**
 * 商品コード(P列)が一致する行を探す。
 * @returns {{rowIndex: number, row: string[]}} rowIndex は 0 始まり
 */
async function findProductRow(sheets, title, productCode) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.masterSpreadsheetId,
    range: `'${title}'!A1:AZ2000`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = res.data.values || [];
  const target = String(productCode).trim();
  const rowIndex = rows.findIndex((r) => String(r?.[COLUMNS.productCode] ?? "").trim() === target);
  if (rowIndex === -1) {
    throw new Error(`商品コード ${productCode} の行が返礼品マスタに見つかりません`);
  }
  return { rowIndex, row: rows[rowIndex] };
}

/**
 * 変更種別ごとに、書き換える対象セル（列インデックスと新しい値）を決める。
 * @returns {{column: number, label: string, newValue: string}[]}
 */
function resolveEdits(type, payload, product) {
  switch (type) {
    case "stock":
      // 停止/再開は在庫数セルを書き換えず、備考のみに記録する
      if (payload.action !== "adjust") return [];
      return [{ column: COLUMNS.stock, label: "在庫数", newValue: String(payload.newStock) }];
    case "price":
      return [{ column: COLUMNS.settlement, label: "精算額", newValue: String(payload.newPrice) }];
    case "shippingPeriod":
      return [
        { column: COLUMNS.shippingFrom, label: "発送期間開始", newValue: payload.shippingFrom },
        { column: COLUMNS.shippingTo, label: "発送期間終了", newValue: payload.shippingTo },
      ];
    // 受付期間・変更希望日は返礼品マスタに対応列がないため、備考への記録のみ行う
    case "acceptPeriod":
    case "desiredDate":
      return [];
    default:
      return [];
  }
}

function buildRemark(type, payload, edits, row, operatorName) {
  const stamp = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const parts = edits.map((e) => {
    const before = String(row?.[e.column] ?? "").trim() || "(空欄)";
    return `${e.label}: ${before} → ${e.newValue}`;
  });

  if (type === "stock" && payload.action !== "adjust") {
    parts.push(payload.action === "pause" ? "受付を停止" : "受付を再開");
  }
  if (type === "acceptPeriod") {
    parts.push(`受付期間の変更希望: ${payload.acceptFrom} 〜 ${payload.acceptTo}`);
  }
  if (type === "desiredDate") {
    parts.push(`変更希望日: ${payload.desiredDate}`);
  }

  return `[${stamp}] ${operatorName} がポータルから変更 / ${parts.join(" ／ ")}`;
}

/**
 * 事業者の変更申請を塩尻市マスタ「返礼品マスタ」へ反映する。
 * - 該当セルを新しい値で更新し、背景を黄色で塗りつぶす
 * - C列の備考に「更新前の値」と「何を変更したか」を追記する
 *
 * GOOGLE_SERVICE_ACCOUNT_JSON 未設定の場合はスキップする（開発環境向け）。
 */
export async function applyChangeToMaster({ type, payload, product, operatorName }) {
  const sheets = getClient();
  if (!sheets) {
    console.warn("[sheets] GOOGLE_SERVICE_ACCOUNT_JSON が未設定のためマスタ更新をスキップしました");
    return { skipped: true };
  }

  const { sheetId, title } = await getSheetMeta(sheets);
  const { rowIndex, row } = await findProductRow(sheets, title, product.productCode);

  const edits = resolveEdits(type, payload, product);
  const remark = buildRemark(type, payload, edits, row, operatorName);

  const existingRemark = String(row?.[COLUMNS.remarks] ?? "").trim();
  const newRemark = existingRemark ? `${existingRemark}\n${remark}` : remark;

  const sheetRow = rowIndex + 1; // A1記法は1始まり
  const valueUpdates = [
    ...edits.map((e) => ({
      range: `'${title}'!${columnLetter(e.column)}${sheetRow}`,
      values: [[e.newValue]],
    })),
    {
      range: `'${title}'!${columnLetter(COLUMNS.remarks)}${sheetRow}`,
      values: [[newRemark]],
    },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.masterSpreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data: valueUpdates },
  });

  // 更新したセル（値セル + 備考セル）の背景を黄色に塗る
  const highlightColumns = [...edits.map((e) => e.column), COLUMNS.remarks];
  const formatRequests = highlightColumns.map((col) => ({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
        startColumnIndex: col,
        endColumnIndex: col + 1,
      },
      cell: { userEnteredFormat: { backgroundColor: YELLOW } },
      fields: "userEnteredFormat.backgroundColor",
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.masterSpreadsheetId,
    requestBody: { requests: formatRequests },
  });

  return {
    skipped: false,
    ok: true,
    sheetTitle: title,
    row: sheetRow,
    updatedColumns: edits.map((e) => `${columnLetter(e.column)}(${e.label})`),
    remark,
  };
}

/**
 * 返礼品マスタ全体を読み取り、事業者ごとの取り扱い返礼品として返す。
 * 管理画面のマスタ取込（ファイルアップロードの代わり）に使う。
 */
export async function readMasterProducts() {
  const sheets = getClient();
  if (!sheets) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON が未設定のため塩尻市マスタを読み取れません");

  const { title } = await getSheetMeta(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.masterSpreadsheetId,
    range: `'${title}'!A1:AZ2000`,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = res.data.values || [];
  const out = [];

  for (const row of rows) {
    const productCode = String(row?.[COLUMNS.productCode] ?? "").trim();
    const operatorName = String(row?.[COLUMNS.operator] ?? "").trim();
    const productName = String(row?.[COLUMNS.productName] ?? "").trim();
    // ヘッダー行や空行を除外
    if (!productCode || !operatorName || !productName) continue;
    if (productCode === "アース商品コード") continue;

    out.push({
      productCode,
      operatorName,
      productName,
      stock: toNumber(row?.[COLUMNS.stock]),
      price: toNumber(row?.[COLUMNS.settlement]),
      shippingFrom: toIsoDate(row?.[COLUMNS.shippingFrom]),
      shippingTo: toIsoDate(row?.[COLUMNS.shippingTo]),
    });
  }

  return out;
}

function toNumber(value) {
  if (value == null || value === "") return 0;
  return Number(String(value).replace(/[^\d.-]/g, "")) || 0;
}

function toIsoDate(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
