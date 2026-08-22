// スクロール式ホイールピッカー（年月日・数量・価格の選択に利用）
// 依存なしのバニラJS。iOSの日付ピッカーのような「スクロールして真ん中で決定」UIを提供する。

const ITEM_HEIGHT = 40;
const VISIBLE_COUNT = 5; // 奇数にすること
const PAD_COUNT = Math.floor(VISIBLE_COUNT / 2);

/**
 * @param {HTMLElement} container
 * @param {{values: Array<{value:any,label:string}>, initialIndex?: number, onChange?: (value:any, index:number)=>void}} opts
 */
export function createWheelPicker(container, opts) {
  let values = opts.values;
  let selectedIndex = clamp(opts.initialIndex ?? 0, 0, values.length - 1);
  let onChange = opts.onChange || (() => {});
  let scrollTimer = null;
  let suppressEvent = false;

  container.classList.add("wheel-picker");
  container.style.height = `${ITEM_HEIGHT * VISIBLE_COUNT}px`;

  const list = document.createElement("div");
  list.className = "wheel-picker-list";
  container.innerHTML = "";
  container.appendChild(list);

  const highlight = document.createElement("div");
  highlight.className = "wheel-picker-highlight";
  highlight.style.height = `${ITEM_HEIGHT}px`;
  container.appendChild(highlight);

  function render() {
    list.innerHTML = "";
    const padStyle = `height:${ITEM_HEIGHT * PAD_COUNT}px;flex:none;`;
    const padTop = document.createElement("div");
    padTop.style.cssText = padStyle;
    list.appendChild(padTop);

    values.forEach((v, i) => {
      const el = document.createElement("div");
      el.className = "wheel-picker-item";
      el.style.height = `${ITEM_HEIGHT}px`;
      el.textContent = v.label;
      el.dataset.index = String(i);
      list.appendChild(el);
    });

    const padBottom = document.createElement("div");
    padBottom.style.cssText = padStyle;
    list.appendChild(padBottom);
  }

  function scrollToIndex(index, smooth = true) {
    suppressEvent = true;
    container.scrollTo({ top: index * ITEM_HEIGHT, behavior: smooth ? "smooth" : "auto" });
    window.setTimeout(() => (suppressEvent = false), smooth ? 300 : 0);
  }

  function updateActiveStyles() {
    const items = list.querySelectorAll(".wheel-picker-item");
    items.forEach((el) => {
      const idx = Number(el.dataset.index);
      const distance = Math.abs(idx - selectedIndex);
      el.classList.toggle("is-selected", idx === selectedIndex);
      el.style.opacity = String(Math.max(0.25, 1 - distance * 0.35));
    });
  }

  function handleScrollEnd() {
    const rawIndex = Math.round(container.scrollTop / ITEM_HEIGHT);
    const idx = clamp(rawIndex, 0, values.length - 1);
    if (idx !== selectedIndex) {
      selectedIndex = idx;
    }
    scrollToIndex(idx, false);
    updateActiveStyles();
    if (!suppressEvent) {
      onChange(values[selectedIndex].value, selectedIndex);
    }
  }

  container.addEventListener("scroll", () => {
    updateActiveStyles();
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(handleScrollEnd, 120);
  });

  render();
  scrollToIndex(selectedIndex, false);
  updateActiveStyles();

  return {
    setValues(newValues, newIndex) {
      values = newValues;
      selectedIndex = clamp(newIndex ?? selectedIndex, 0, values.length - 1);
      render();
      scrollToIndex(selectedIndex, false);
      updateActiveStyles();
    },
    getValue() {
      return values[selectedIndex]?.value;
    },
    setIndex(idx, fireChange = true) {
      selectedIndex = clamp(idx, 0, values.length - 1);
      scrollToIndex(selectedIndex, false);
      updateActiveStyles();
      if (fireChange) onChange(values[selectedIndex].value, selectedIndex);
    },
  };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 年・月・日の3つのホイールを組み合わせた日付ピッカーを作成する。
 * @param {HTMLElement} container
 * @param {{initialDate?: string, yearsAhead?: number, onChange?: (isoDate:string)=>void}} opts
 */
export function createDateWheelPicker(container, opts = {}) {
  const today = new Date();
  const initial = opts.initialDate ? new Date(opts.initialDate) : today;
  const startYear = today.getFullYear();
  const endYear = startYear + (opts.yearsAhead ?? 2);

  container.classList.add("date-wheel-group");
  container.innerHTML = "";

  const yearCol = document.createElement("div");
  yearCol.className = "wheel-col";
  const monthCol = document.createElement("div");
  monthCol.className = "wheel-col";
  const dayCol = document.createElement("div");
  dayCol.className = "wheel-col";

  container.appendChild(yearCol);
  container.appendChild(monthCol);
  container.appendChild(dayCol);

  const state = {
    year: clamp(initial.getFullYear(), startYear, endYear),
    month: initial.getMonth() + 1,
    day: initial.getDate(),
  };

  function emit() {
    const iso = `${state.year}-${String(state.month).padStart(2, "0")}-${String(state.day).padStart(2, "0")}`;
    if (opts.onChange) opts.onChange(iso);
  }

  const yearPicker = createWheelPicker(yearCol, {
    values: range(startYear, endYear).map((y) => ({ value: y, label: `${y}年` })),
    initialIndex: state.year - startYear,
    onChange: (v) => {
      state.year = v;
      refreshDays();
      emit();
    },
  });

  const monthPicker = createWheelPicker(monthCol, {
    values: range(1, 12).map((m) => ({ value: m, label: `${m}月` })),
    initialIndex: state.month - 1,
    onChange: (v) => {
      state.month = v;
      refreshDays();
      emit();
    },
  });

  let dayPicker;
  function refreshDays(fireChange = false) {
    const max = daysInMonth(state.year, state.month);
    if (state.day > max) state.day = max;
    const values = range(1, max).map((d) => ({ value: d, label: `${d}日` }));
    if (dayPicker) {
      dayPicker.setValues(values, state.day - 1);
    }
    if (fireChange) emit();
  }

  dayPicker = createWheelPicker(dayCol, {
    values: range(1, daysInMonth(state.year, state.month)).map((d) => ({ value: d, label: `${d}日` })),
    initialIndex: state.day - 1,
    onChange: (v) => {
      state.day = v;
      emit();
    },
  });

  return {
    getIsoDate() {
      return `${state.year}-${String(state.month).padStart(2, "0")}-${String(state.day).padStart(2, "0")}`;
    },
    setIsoDate(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return;
      state.year = clamp(d.getFullYear(), startYear, endYear);
      state.month = d.getMonth() + 1;
      state.day = d.getDate();
      yearPicker.setIndex(state.year - startYear, false);
      monthPicker.setIndex(state.month - 1, false);
      refreshDays(false);
    },
  };
}

/**
 * 数値ホイールピッカー（在庫の増減量・価格などに利用）
 * @param {HTMLElement} container
 * @param {{min:number, max:number, step?:number, initialValue?:number, unit?:string, onChange?:(v:number)=>void}} opts
 */
export function createNumberWheelPicker(container, opts) {
  const step = opts.step ?? 1;
  const values = [];
  for (let v = opts.min; v <= opts.max; v += step) {
    values.push({ value: v, label: `${v > 0 && opts.showSign ? "+" : ""}${v}${opts.unit || ""}` });
  }
  const initialIndex = Math.max(
    0,
    values.findIndex((v) => v.value === (opts.initialValue ?? opts.min))
  );
  return createWheelPicker(container, {
    values,
    initialIndex,
    onChange: opts.onChange,
  });
}
