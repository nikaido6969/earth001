import { config } from "./config.js";

/**
 * 返礼品名の表記ゆれを吸収する。
 * 半角カナ（ｼﾞｭｰｽ）や全角英数を、NFKC正規化で全角カナ・半角英数に統一する。
 */
export function normalize(text) {
  return String(text || "").normalize("NFKC");
}

/**
 * 返礼品名が対象カテゴリ（りんご・ぶどう類・米の青果物）に該当するか判定する。
 *
 * 加工品（ジュース・ワイン・日本酒・シードル・菓子など）は、
 * 名前にカテゴリ名を含んでいても青果物ではないため除外する。
 * 例:「信州りんごジュース」「純米大吟醸」「マスカットベリーA ワイン」は対象外。
 */
export function isTargetProduct(productName) {
  const name = normalize(productName);
  if (!name) return false;

  // 先に除外判定を行う（加工品を確実に落とすため）
  if (config.excludeProductKeywords.some((kw) => name.includes(normalize(kw)))) return false;

  if (!config.targetProductKeywords.length) return true;
  return config.targetProductKeywords.some((kw) => name.includes(normalize(kw)));
}

/**
 * 事業者ごとの返礼品リストを、試験導入スコープに絞り込む。
 *
 * 返礼品名で対象の返礼品を抽出し、対象返礼品を1件以上持つ事業者を対象事業者とする。
 * 事業者名を事前に列挙する必要がないため、青果物を扱う事業者を漏れなく抽出できる。
 * TARGET_OPERATORS を設定した場合のみ、対象事業者をさらに限定する。
 */
export function filterToTargetScope(groups) {
  const { targetOperators } = config;

  return groups
    .filter((g) => !targetOperators.length || targetOperators.some((kw) => normalize(g.operatorName).includes(normalize(kw))))
    .map((g) => ({ ...g, products: g.products.filter((p) => isTargetProduct(p.productName)) }))
    .filter((g) => g.products.length > 0);
}
