import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/**
 * 依存パッケージなしで動かせるよう、JSONファイルを簡易DBとして使う。
 * 案件規模（自治体パイロット・数十事業者）であればこれで十分な性能。
 */
class JsonStore {
  constructor(name, defaultValue) {
    this.file = path.join(config.dataDir, `${name}.json`);
    this.defaultValue = defaultValue;
    this._ensure();
  }

  _ensure() {
    fs.mkdirSync(config.dataDir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify(this.defaultValue, null, 2));
    }
  }

  read() {
    this._ensure();
    const raw = fs.readFileSync(this.file, "utf-8");
    try {
      return JSON.parse(raw);
    } catch {
      return this.defaultValue;
    }
  }

  write(data) {
    this._ensure();
    // 単純化のため同期書き込み（低頻度・低同時実行のMVP用途）
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
    return data;
  }
}

export const operatorsStore = new JsonStore("operators", []);
export const productsStore = new JsonStore("products", []);
export const changeRequestsStore = new JsonStore("changeRequests", []);

export function nextId(items) {
  return items.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
}
