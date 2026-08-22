import XLSX from "xlsx";

/**
 * 塩尻市マスタ（返礼品マスタ）取込用の列名エイリアス。
 * 実際のスプレッドシートの見出し表記ゆれに対応するため、複数候補から一致させる。
 */
const COLUMN_ALIASES = {
  operatorName: ["事業者名", "事業者", "取扱事業者", "事業者名称"],
  operatorId: ["事業者ID", "事業者コード", "事業者番号"],
  productCode: ["返礼品コード", "商品コード", "品番", "コード"],
  productName: ["返礼品名", "商品名", "品名"],
  price: ["商品代", "商品代金", "寄付額", "寄附額", "金額"],
  stock: ["在庫数", "在庫", "数量"],
  stockStatus: ["受付状況", "販売状況", "状態"],
  shippingFrom: ["発送開始日", "発送期間(from)", "発送開始"],
  shippingTo: ["発送終了日", "発送期間(to)", "発送終了"],
  acceptFrom: ["受付開始日", "受付期間(from)", "受付開始"],
  acceptTo: ["受付終了日", "受付期間(to)", "受付終了"],
};

function resolveHeaderMap(headerRow) {
  const map = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = headerRow.findIndex((h) => aliases.includes(String(h || "").trim()));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

function excelSerialToIso(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const date = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(value) : null;
    if (date) {
      const iso = new Date(Date.UTC(date.y, date.m - 1, date.d));
      return iso.toISOString().slice(0, 10);
    }
  }
  const str = String(value).trim();
  const m = str.match(/^(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/**
 * 塩尻市マスタ（xlsx/csv バッファ）を解析し、事業者ごとにグループ化した返礼品リストを返す。
 * @param {Buffer} buffer
 * @returns {{operatorName: string, operatorId: string|null, products: object[]}[]}
 */
function looksLikeCsv(buffer) {
  // xlsx はZIP形式（先頭2バイトが "PK"）。それ以外はCSV/テキストとみなす。
  return !(buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b);
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseMasterFile(buffer, filename = "") {
  const isCsv = /\.csv$/i.test(filename) || (!/\.xlsx?$/i.test(filename) && looksLikeCsv(buffer));
  const workbook = isCsv
    ? XLSX.read(stripBom(buffer.toString("utf-8")), { type: "string", cellDates: false })
    : XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames.find((n) => /マスタ|返礼品/.test(n)) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  if (rows.length < 2) {
    throw new Error("マスタファイルにデータ行が見つかりませんでした");
  }

  const headerRow = rows[0].map((h) => String(h || "").trim());
  const map = resolveHeaderMap(headerRow);

  const required = ["operatorName", "productCode", "productName"];
  const missing = required.filter((f) => map[f] === undefined);
  if (missing.length) {
    throw new Error(
      `必須列が見つかりません: ${missing.join(", ")}（1行目に見出しがあるか確認してください。対応列: ${JSON.stringify(
        COLUMN_ALIASES
      )}）`
    );
  }

  const byOperator = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === "" || c == null)) continue;

    const operatorName = String(row[map.operatorName] ?? "").trim();
    if (!operatorName) continue;

    const productCode = String(row[map.productCode] ?? "").trim();
    const productName = String(row[map.productName] ?? "").trim();
    if (!productCode || !productName) continue;

    const operatorId = map.operatorId !== undefined ? String(row[map.operatorId] ?? "").trim() || null : null;

    const product = {
      productCode,
      productName,
      price: map.price !== undefined ? Number(String(row[map.price]).replace(/[^\d.-]/g, "")) || 0 : 0,
      stock: map.stock !== undefined ? Number(String(row[map.stock]).replace(/[^\d.-]/g, "")) || 0 : 0,
      stockStatus: map.stockStatus !== undefined && /停止|中止/.test(String(row[map.stockStatus])) ? "paused" : "active",
      shippingFrom: map.shippingFrom !== undefined ? excelSerialToIso(row[map.shippingFrom]) : null,
      shippingTo: map.shippingTo !== undefined ? excelSerialToIso(row[map.shippingTo]) : null,
      acceptFrom: map.acceptFrom !== undefined ? excelSerialToIso(row[map.acceptFrom]) : null,
      acceptTo: map.acceptTo !== undefined ? excelSerialToIso(row[map.acceptTo]) : null,
    };

    const key = operatorId || operatorName;
    if (!byOperator.has(key)) {
      byOperator.set(key, { operatorName, operatorId, products: [] });
    }
    byOperator.get(key).products.push(product);
  }

  return Array.from(byOperator.values());
}
