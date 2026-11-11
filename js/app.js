/**
 * 青森県 市町村データ100 かんたんマップ＆レポート
 * Application Logic
 */

// 令和2年(2020年)国勢調査確定人口マスター（青森県40市町村）
const CENSUS_POPULATION_2020 = {
  "青森市": 275192,
  "弘前市": 168466,
  "八戸市": 223415,
  "黒石市": 31946,
  "五所川原市": 51415,
  "十和田市": 60378,
  "三沢市": 39152,
  "むつ市": 54103,
  "つがる市": 30934,
  "平川市": 30567,
  "平内町": 10126,
  "今別町": 2334,
  "蓬田村": 2540,
  "外ヶ浜町": 5401,
  "鰺ヶ沢町": 9044,
  "深浦町": 7346,
  "西目屋村": 1265,
  "藤崎町": 14573,
  "大鰐町": 8665,
  "田舎館村": 7326,
  "板柳町": 12700,
  "鶴田町": 12074,
  "中泊町": 9657,
  "野辺地町": 12374,
  "七戸町": 14556,
  "六戸町": 10447,
  "横浜町": 4229,
  "東北町": 16428,
  "六ヶ所村": 10367,
  "おいらせ町": 24273,
  "大間町": 4718,
  "東通村": 5955,
  "風間浦村": 1636,
  "佐井村": 1788,
  "三戸町": 9082,
  "五戸町": 16042,
  "田子町": 4968,
  "南部町": 16809,
  "階上町": 13496,
  "新郷村": 2197
};

// カラーパレット定義（5段階）
const PALETTES = {
  blue: {
    name: "ブルー",
    colors: ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e40af"]
  },
  green: {
    name: "グリーン",
    colors: ["#ecfdf5", "#a7f3d0", "#34d399", "#059669", "#065f46"]
  },
  warm: {
    name: "オレンジ/赤",
    colors: ["#fff7ed", "#fed7aa", "#fb923c", "#ea580c", "#9a3412"]
  },
  purple: {
    name: "パープル",
    colors: ["#faf5ff", "#e9d5ff", "#c084fc", "#9333ea", "#581c87"]
  }
};

// 代表的な人気指標（クイックピック用）
const QUICK_PICKS = [
  { id: "var_2", label: "人口" },
  { id: "var_3", label: "人口密度" },
  { id: "var_28", label: "製造業粗付加価値額" },
  { id: "var_57", label: "1人当たり所得" },
  { id: "var_69", label: "医師数(10万人対)" },
  { id: "var_86", label: "大学進学率" },
  { id: "var_104", label: "財政力指数" }
];

// アプリケーション状態
const state = {
  activeVarId: "var_2", // 初期指標: 人口
  isPerCapita: false,   // 人口1,000人あたり補正モード（false: 実測値, true: 人口1,000人あたり）
  activePalette: "blue",
  filteredList: [],
  leafletMap: null,
  geoJsonLayer: null,
  outerBorderLayer: null,
  legendControl: null,
  currentBreaks: [],
  currentStats: null
};

// 実効データの取得（実測値 or 人口1,000人あたり）
function getEffectiveData(varItem) {
  if (!varItem) return { data: {}, unit: "", isPerCapita: false };

  if (!state.isPerCapita) {
    return {
      data: varItem.data,
      unit: varItem.unit || "",
      isPerCapita: false
    };
  }

  // 人口1,000人あたり変換: (val / pop2020) * 1000
  const transformed = {};
  for (const [muni, val] of Object.entries(varItem.data)) {
    const pop = CENSUS_POPULATION_2020[muni];
    if (val !== null && val !== undefined && !isNaN(val) && typeof pop === 'number' && pop > 0) {
      transformed[muni] = (val / pop) * 1000;
    } else {
      transformed[muni] = null;
    }
  }

  const rawUnit = varItem.unit ? varItem.unit.replace(/^単位[：:]\s*/, "").trim() : "";
  const perCapitaUnit = rawUnit ? `${rawUnit} / 千人` : "人口1,000人対";

  return {
    data: transformed,
    unit: perCapitaUnit,
    isPerCapita: true
  };
}

// 色ユーティリティ
function hexToRgb(hex) {
  let c = (hex || "#ffffff").replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return [ (num >> 16) & 255, (num >> 8) & 255, num & 255 ];
}

// 元のツールと同一の境界線スタイル計算（塗りの明度に応じて白またはダークスレート）
function getBorderStrokeForFeature(fillColor) {
  if (!fillColor || fillColor === "transparent") {
    return { color: "#475569", weight: 1.5 };
  }
  const rgb = hexToRgb(fillColor || "#ffffff");
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const isVeryDark = (lum < 60);

  if (isVeryDark) {
    return { color: "#ffffff", weight: 2.0 };
  }
  return { color: "#334155", weight: 1.5 };
}

// 外周県境境界線の抽出（元のツールと同一アルゴリズム）
let cachedOuterBoundaryGeoJSON = null;
function getOuterBorderGeoJSON(geojsonData) {
  if (cachedOuterBoundaryGeoJSON) return cachedOuterBoundaryGeoJSON;
  if (!geojsonData || !geojsonData.features) return null;

  const segmentCounts = new Map();
  const segmentGeoms = new Map();
  const coordKey = (pt) => `${pt[0].toFixed(5)},${pt[1].toFixed(5)}`;

  function processRing(ring) {
    for (let i = 0; i < ring.length - 1; i++) {
      const p1 = ring[i];
      const p2 = ring[i + 1];
      const k1 = coordKey(p1);
      const k2 = coordKey(p2);
      if (k1 === k2) continue;

      const key = k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
      if (segmentCounts.has(key)) {
        segmentCounts.set(key, segmentCounts.get(key) + 1);
      } else {
        segmentCounts.set(key, 1);
        segmentGeoms.set(key, [p1, p2]);
      }
    }
  }

  geojsonData.features.forEach(feature => {
    const geom = feature.geometry;
    if (!geom) return;
    if (geom.type === "Polygon") {
      geom.coordinates.forEach(ring => processRing(ring));
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach(polygon => {
        polygon.forEach(ring => processRing(ring));
      });
    }
  });

  const outerSegments = [];
  segmentCounts.forEach((count, key) => {
    if (count === 1) {
      outerSegments.push(segmentGeoms.get(key));
    }
  });

  cachedOuterBoundaryGeoJSON = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: {
        type: "MultiLineString",
        coordinates: outerSegments
      },
      properties: { name: "Aomori Outer Boundary" }
    }]
  };

  return cachedOuterBoundaryGeoJSON;
}

// 数値フォーマッタ
function formatNum(val, decimals = null) {
  if (val === null || val === undefined || isNaN(val)) return "-";
  if (decimals !== null) {
    return Number(val).toLocaleString("ja-JP", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
  // 人口千人対モードの場合は小数をスマートに表示
  if (state.isPerCapita) {
    if (Math.abs(val) < 10 && val % 1 !== 0) {
      return Number(val).toLocaleString("ja-JP", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    return Number(val).toLocaleString("ja-JP", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    });
  }
  if (val % 1 !== 0) {
    return Number(val).toLocaleString("ja-JP", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    });
  }
  return Number(val).toLocaleString("ja-JP");
}

function computePercentile(sortedNums, p) {
  const n = sortedNums.length;
  if (n === 0) return 0;
  if (n === 1) return sortedNums[0];
  const idx = p * (n - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  const weight = idx - low;
  return sortedNums[low] * (1 - weight) + sortedNums[high] * weight;
}

// 統計量の計算（合計、平均、中央値、最大、最小、分散、標準偏差、四分位範囲など）
function computeStats(effectiveObj) {
  const data = effectiveObj.data;
  const entries = [];
  for (const [muni, val] of Object.entries(data)) {
    if (val !== null && val !== undefined && !isNaN(val)) {
      entries.push({ muni, val });
    }
  }

  if (entries.length === 0) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      median: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      variance: 0,
      stdDev: 0,
      min: { muni: "-", val: null },
      max: { muni: "-", val: null },
      sorted: [],
      numList: [],
      ranks: {},
      isPerCapita: effectiveObj.isPerCapita
    };
  }

  // 降順ソート（1位〜40位）
  entries.sort((a, b) => b.val - a.val);

  const ranks = {};
  entries.forEach((item, idx) => {
    ranks[item.muni] = idx + 1;
  });

  // 昇順数値リスト（パーセンタイル、KDE用）
  const numListAsc = [...entries].sort((a, b) => a.val - b.val).map(e => e.val);
  const n = entries.length;
  const sum = numListAsc.reduce((a, b) => a + b, 0);
  const mean = n > 0 ? sum / n : 0;
  const variance = n > 1 ? numListAsc.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);

  const median = computePercentile(numListAsc, 0.50);
  const q1 = computePercentile(numListAsc, 0.25);
  const q3 = computePercentile(numListAsc, 0.75);
  const iqr = q3 - q1;

  return {
    count: n,
    sum: sum,
    mean: mean,
    median: median,
    q1: q1,
    q3: q3,
    iqr: iqr,
    variance: variance,
    stdDev: stdDev,
    max: entries[0],
    min: entries[entries.length - 1],
    sorted: entries,
    numList: numListAsc,
    ranks: ranks,
    isPerCapita: effectiveObj.isPerCapita
  };
}

// 人間にとって認知しやすいキリの良い数値（1, 2, 2.5, 5 × 10^n）にスナップ丸めする関数
function roundToNiceNumber(val, localDiff) {
  if (val === 0) return 0;
  // 目安となる刻み幅（隣との差、または自身の約1/8〜1/3）
  const targetStep = Math.max(Math.abs(localDiff) * 0.35, Math.abs(val) * 0.08);
  const exp = Math.floor(Math.log10(targetStep));
  const base = Math.pow(10, exp);

  // キリの良い刻み候補: 0.1, 0.2, 0.5, 1, 2, 2.5, 5, 10
  const steps = [
    base * 0.1,
    base * 0.2,
    base * 0.5,
    base * 1.0,
    base * 2.0,
    base * 2.5,
    base * 5.0,
    base * 10.0
  ];

  let bestStep = base;
  for (const s of steps) {
    if (s <= targetStep * 1.8 && s >= targetStep * 0.4) {
      bestStep = s;
      break;
    }
  }

  let rounded = Math.round(val / bestStep) * bestStep;
  const decimals = Math.max(0, -exp + 1);
  return parseFloat(rounded.toFixed(decimals));
}

// 案A: スマート・キリ良し階級区分（Smart Snapped Breaks）
// 分位数の「各階級に自治体が均等に散らばる」利点を保ちつつ、境界値を端数のない自然な丸い数値に自動スナップ
function computeSmartBreaks(sortedEntries, k = 5) {
  if (!sortedEntries || sortedEntries.length === 0) return [0, 0, 0, 0, 0, 0];
  const vals = sortedEntries
    .map(e => e.val)
    .filter(v => typeof v === 'number' && !isNaN(v))
    .sort((a, b) => a - b);
  
  const n = vals.length;
  if (n === 0) return [0, 0, 0, 0, 0, 0];

  const minVal = vals[0];
  const maxVal = vals[n - 1];

  if (minVal === maxVal) {
    return Array(k + 1).fill(minVal);
  }

  // 1. 各分位点の原値を算出
  const rawQ = [minVal];
  for (let i = 1; i < k; i++) {
    rawQ.push(computePercentile(vals, i / k));
  }
  rawQ.push(maxVal);

  // 2. 中間の k-1 個の境界値をローカル間隔に基づきキリの良い数値にスナップ
  const snapped = [];
  for (let i = 1; i < k; i++) {
    const val = rawQ[i];
    const prev = rawQ[i - 1];
    const next = rawQ[i + 1];
    const localDiff = Math.min(val - prev, next - val);
    let nice = roundToNiceNumber(val, localDiff);
    snapped.push(nice);
  }

  // 3. 厳格な単調増加性を保証（重なりや逆転を防止）
  for (let i = 0; i < snapped.length; i++) {
    if (i === 0) {
      if (snapped[i] <= minVal) {
        snapped[i] = rawQ[1];
      }
    } else {
      if (snapped[i] <= snapped[i - 1]) {
        const step = Math.abs(rawQ[i + 1] - snapped[i - 1]) * 0.3;
        snapped[i] = roundToNiceNumber(snapped[i - 1] + step, step);
        if (snapped[i] <= snapped[i - 1]) {
          snapped[i] = snapped[i - 1] + (maxVal - minVal) * 0.01;
        }
      }
    }
  }

  // 4. 配列組み立て [min, q1_snap, q2_snap, q3_snap, q4_snap, max]
  const breaks = [minVal, ...snapped, maxVal];

  // 最終安全性チェック（微小増分で必ず狭義単調増加にする）
  for (let i = 1; i < breaks.length; i++) {
    if (breaks[i] <= breaks[i - 1]) {
      breaks[i] = breaks[i - 1] + 0.0001;
    }
  }

  return breaks;
}

// 互換性エイリアス
const computeQuantileBreaks = computeSmartBreaks;

// 値に対応する色の取得
function getColorForValue(val, breaks, paletteKey) {
  if (val === null || val === undefined || isNaN(val)) {
    return "#e2e8f0";
  }
  const colors = PALETTES[paletteKey].colors;
  const k = colors.length;

  for (let i = 0; i < k; i++) {
    if (val <= breaks[i + 1] || i === k - 1) {
      return colors[i];
    }
  }
  return colors[k - 1];
}

/* ==========================================================================
   Leaflet Map Control (Fixed & Maximized View, No Dragging / Zooming needed)
   ========================================================================== */
function initLeafletMap() {
  const map = L.map("map-view", {
    center: [40.78, 140.75],
    zoom: 9,
    minZoom: 5,
    maxZoom: 18,
    zoomSnap: 0,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomControl: false,
    attributionControl: false
  });

  state.leafletMap = map;

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function() {
    const div = L.DomUtil.create("div", "map-legend-control");
    div.id = "leaflet-legend-box";
    return div;
  };
  legend.addTo(map);
  state.legendControl = legend;
}

function fitMapToContainer() {
  if (!state.leafletMap || !state.geoJsonLayer) return;
  state.leafletMap.invalidateSize();
  const bounds = state.geoJsonLayer.getBounds();
  state.leafletMap.fitBounds(bounds, {
    padding: [0, 0],
    animate: false
  });
}

function updateLeafletMap() {
  const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
  if (!currentVar) return;

  const effective = getEffectiveData(currentVar);
  const stats = computeStats(effective);
  state.currentStats = stats;

  const breaks = computeQuantileBreaks(stats.sorted, 5);
  state.currentBreaks = breaks;

  if (state.geoJsonLayer) {
    state.leafletMap.removeLayer(state.geoJsonLayer);
    state.geoJsonLayer = null;
  }
  if (state.outerBorderLayer) {
    state.leafletMap.removeLayer(state.outerBorderLayer);
    state.outerBorderLayer = null;
  }

  // 1. 各市町村ポリゴンの描画
  state.geoJsonLayer = L.geoJSON(AOMORI_GEOJSON, {
    style: function(feature) {
      const muniName = feature.properties.name;
      const val = effective.data[muniName];
      const fillColor = getColorForValue(val, breaks, state.activePalette);
      const strokeInfo = getBorderStrokeForFeature(fillColor);

      return {
        fillColor: fillColor,
        fillOpacity: 0.92,
        color: strokeInfo.color,
        weight: strokeInfo.weight,
        opacity: 0.9
      };
    },
    onEachFeature: function(feature, layer) {
      const muniName = feature.properties.name;
      const val = effective.data[muniName];
      const rank = stats.ranks[muniName];

      const rankStr = rank ? `（全40市町村中 第 <strong style="color:#2563eb;">${rank}</strong> 位）` : "";
      const valStr = val !== null && val !== undefined ? `${formatNum(val)} <span style="font-size:0.8rem; font-weight:normal;">${effective.unit}</span>` : "データなし";

      let popInfo = "";
      if (state.isPerCapita) {
        const rawVal = currentVar.data[muniName];
        popInfo = `<div style="font-size:0.72rem; color:#64748b; margin-top:2px;">(実測値: ${formatNum(rawVal)} ${currentVar.unit || ''} / 2020年人口: ${formatNum(CENSUS_POPULATION_2020[muniName])}人)</div>`;
      }

      layer.bindTooltip(`
        <div class="tooltip-muni-name">${muniName}</div>
        <div class="tooltip-val">${valStr}</div>
        <div class="tooltip-rank">${rankStr}</div>
        ${popInfo}
      `, {
        className: "muni-tooltip",
        sticky: true,
        direction: "top",
        offset: [0, -10]
      });

      layer.on({
        mouseover: function(e) {
          const l = e.target;
          l.setStyle({
            weight: 3.0,
            color: "#0f172a",
            fillOpacity: 0.96
          });
          if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            l.bringToFront();
            if (state.outerBorderLayer) {
              state.outerBorderLayer.bringToFront();
            }
          }
        },
        mouseout: function(e) {
          state.geoJsonLayer.resetStyle(e.target);
          if (state.outerBorderLayer) {
            state.outerBorderLayer.bringToFront();
          }
        }
      });
    }
  }).addTo(state.leafletMap);

  // 2. 外周県境境界線の描画（最前面）
  const outerGeoJSON = getOuterBorderGeoJSON(AOMORI_GEOJSON);
  if (outerGeoJSON) {
    state.outerBorderLayer = L.geoJSON(outerGeoJSON, {
      style: {
        color: "#0f172a",
        weight: 2.4,
        fill: false,
        opacity: 0.95
      },
      interactive: false
    }).addTo(state.leafletMap);
    state.outerBorderLayer.bringToFront();
  }

  fitMapToContainer();

  updateLegendUI(breaks, effective.unit);
}

// 凡例用ラベルフォーマッタ（キリの良い自然な区分表記: 〜 N / A 〜 B / N 〜）
function formatLegendLabel(breaks, i, totalClasses) {
  const isUniform = breaks && breaks.length >= 2 && breaks[0] === breaks[breaks.length - 1];
  if (isUniform) {
    return `全域同一値: ${formatNum(breaks[0])}`;
  }
  if (i === 0) {
    return `〜 ${formatNum(breaks[1])}`;
  }
  if (i === totalClasses - 1) {
    return `${formatNum(breaks[i])} 〜`;
  }
  return `${formatNum(breaks[i])} 〜 ${formatNum(breaks[i + 1])}`;
}

function updateLegendUI(breaks, unit) {
  const legendEl = document.getElementById("leaflet-legend-box");
  if (!legendEl) return;

  const colors = PALETTES[state.activePalette].colors;
  const unitStr = unit ? ` (${unit})` : "";

  let html = `<div class="legend-title">階級凡例${unitStr}</div>`;
  const isUniform = breaks && breaks.length >= 2 && breaks[0] === breaks[breaks.length - 1];

  if (isUniform) {
    html += `
      <div class="legend-row">
        <div class="legend-color-box" style="background:${colors[colors.length - 1]}; border-color:#334155;"></div>
        <span>${formatLegendLabel(breaks, 0, colors.length)}</span>
      </div>
    `;
  } else {
    for (let i = 0; i < colors.length; i++) {
      html += `
        <div class="legend-row">
          <div class="legend-color-box" style="background:${colors[i]}; border-color:#334155;"></div>
          <span>${formatLegendLabel(breaks, i, colors.length)}</span>
        </div>
      `;
    }
  }

  html += `
    <div class="legend-row" style="margin-top:3px; padding-top:3px; border-top:1px dashed #e2e8f0; color:#64748b;">
      <div class="legend-color-box" style="background:#e2e8f0; border-color:#94a3b8;"></div>
      <span>データなし</span>
    </div>
  `;

  legendEl.innerHTML = html;
}

/* ==========================================================================
   UI Controller & Event Bindings
   ========================================================================== */
function initUI() {
  const catSelect = document.getElementById("cat-select");
  const searchInput = document.getElementById("search-input");
  const quickPicksContainer = document.getElementById("quick-picks-container");

  const categories = ["すべての分野", ...new Set(STATS_DATA.map(d => d.category))];
  catSelect.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join("");

  quickPicksContainer.innerHTML = QUICK_PICKS.map(p => `
    <button class="quick-tag ${p.id === state.activeVarId ? 'active' : ''}" data-id="${p.id}">
      ${p.label}
    </button>
  `).join("");

  quickPicksContainer.addEventListener("click", e => {
    const btn = e.target.closest(".quick-tag");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    selectVariable(id);
  });

  catSelect.addEventListener("change", () => {
    filterVariables();
  });

  searchInput.addEventListener("input", () => {
    filterVariables();
  });

  // 人口補正（率化）ボタンスイッチ
  const btnModeRaw = document.getElementById("btn-mode-raw");
  const btnMode1000 = document.getElementById("btn-mode-1000");

  function setPerCapitaMode(isPerCapita) {
    state.isPerCapita = isPerCapita;
    btnModeRaw.classList.toggle("active", !isPerCapita);
    btnMode1000.classList.toggle("active", isPerCapita);

    const badge = document.getElementById("active-var-transform-badge");
    if (badge) {
      badge.style.display = isPerCapita ? "inline-block" : "none";
    }

    updateLeafletMap();
    updateInfoPanels();
  }

  if (btnModeRaw) {
    btnModeRaw.addEventListener("click", () => setPerCapitaMode(false));
  }
  if (btnMode1000) {
    btnMode1000.addEventListener("click", () => setPerCapitaMode(true));
  }

  // カラーパレット切り替え
  document.querySelectorAll(".palette-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".palette-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activePalette = btn.getAttribute("data-palette");
      updateLeafletMap();
      updateInfoPanels();
    });
  });

  // サマリーパネルの表示切り替え（指定した時だけ表示）
  const btnToggleSummary = document.getElementById("btn-toggle-summary");
  const summaryPanel = document.getElementById("floating-summary-panel");
  const btnCloseSummary = document.getElementById("btn-close-summary");

  function toggleSummary() {
    if (!summaryPanel) return;
    const isHidden = summaryPanel.classList.toggle("hidden");
    if (btnToggleSummary) {
      btnToggleSummary.classList.toggle("active", !isHidden);
    }
  }

  if (btnToggleSummary) {
    btnToggleSummary.addEventListener("click", toggleSummary);
  }

  if (btnCloseSummary) {
    btnCloseSummary.addEventListener("click", () => {
      if (summaryPanel) summaryPanel.classList.add("hidden");
      if (btnToggleSummary) btnToggleSummary.classList.remove("active");
    });
  }

  // サイドバーの開閉トグル
  const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
  const appSidebar = document.getElementById("app-sidebar");
  if (btnToggleSidebar && appSidebar) {
    btnToggleSidebar.addEventListener("click", () => {
      appSidebar.classList.toggle("collapsed");
      setTimeout(() => {
        fitMapToContainer();
      }, 260);
    });
  }

  window.addEventListener("resize", () => {
    fitMapToContainer();
  });

  // レポートモーダル関連
  const btnOpenReport = document.getElementById("btn-open-report");
  const modalOverlay = document.getElementById("report-modal");
  const btnCloseReport = document.getElementById("btn-close-report");

  if (btnOpenReport) {
    btnOpenReport.addEventListener("click", () => {
      openReportModal();
    });
  }

  if (btnCloseReport) {
    btnCloseReport.addEventListener("click", () => {
      modalOverlay.classList.add("hidden");
    });
  }

  // モーダル背景クリックで閉じる
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.classList.add("hidden");
      }
    });
  }

  // Escapeキーでモーダル・パネルを閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modalOverlay && !modalOverlay.classList.contains("hidden")) {
        modalOverlay.classList.add("hidden");
      }
      if (summaryPanel && !summaryPanel.classList.contains("hidden")) {
        summaryPanel.classList.add("hidden");
        if (btnToggleSummary) btnToggleSummary.classList.remove("active");
      }
    }
  });

  document.getElementById("btn-print-report")?.addEventListener("click", () => {
    window.print();
  });

  document.getElementById("btn-save-report-png")?.addEventListener("click", () => {
    saveReportAsPNG();
  });

  document.getElementById("btn-copy-report-img")?.addEventListener("click", () => {
    copyReportToClipboard();
  });

  // 指標選択スライダーの操作イベント登録
  const varSlider = document.getElementById("var-slider");
  const btnVarPrev = document.getElementById("btn-var-prev");
  const btnVarNext = document.getElementById("btn-var-next");

  if (varSlider) {
    // スライダードラッグ・変更時
    varSlider.addEventListener("input", (e) => {
      const idx = parseInt(e.target.value, 10) - 1;
      if (state.filteredList && state.filteredList[idx]) {
        selectVariable(state.filteredList[idx].id, true);
      }
    });

    // スライダー上でホイール回転した際も前後に移動
    varSlider.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!state.filteredList || state.filteredList.length === 0) return;
      const currentIdx = state.filteredList.findIndex(item => item.id === state.activeVarId);
      const delta = e.deltaY > 0 ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(state.filteredList.length - 1, currentIdx + delta));
      if (nextIdx !== currentIdx) {
        selectVariable(state.filteredList[nextIdx].id, true);
      }
    }, { passive: false });
  }

  if (btnVarPrev) {
    btnVarPrev.addEventListener("click", () => {
      if (!state.filteredList || state.filteredList.length === 0) return;
      const currentIdx = state.filteredList.findIndex(item => item.id === state.activeVarId);
      if (currentIdx > 0) {
        selectVariable(state.filteredList[currentIdx - 1].id, true);
      }
    });
  }

  if (btnVarNext) {
    btnVarNext.addEventListener("click", () => {
      if (!state.filteredList || state.filteredList.length === 0) return;
      const currentIdx = state.filteredList.findIndex(item => item.id === state.activeVarId);
      if (currentIdx < state.filteredList.length - 1) {
        selectVariable(state.filteredList[currentIdx + 1].id, true);
      }
    });
  }

  filterVariables();
  selectVariable(state.activeVarId, true);
}

// スライダーUI（つまみ位置・カウンター・前へ/次へボタン）を同期
function syncSliderUI() {
  const slider = document.getElementById("var-slider");
  const counter = document.getElementById("slider-counter");
  const btnPrev = document.getElementById("btn-var-prev");
  const btnNext = document.getElementById("btn-var-next");
  if (!slider || !state.filteredList) return;

  const total = state.filteredList.length;
  if (total === 0) {
    slider.disabled = true;
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    if (counter) counter.textContent = "0 / 0";
    return;
  }

  slider.disabled = false;
  slider.min = "1";
  slider.max = String(total);

  const currentIdx = state.filteredList.findIndex(item => item.id === state.activeVarId);
  const val = currentIdx >= 0 ? currentIdx + 1 : 1;
  slider.value = String(val);

  if (counter) {
    counter.textContent = `${val} / ${total}`;
  }
  if (btnPrev) {
    btnPrev.disabled = (val <= 1);
  }
  if (btnNext) {
    btnNext.disabled = (val >= total);
  }
}

function filterVariables() {
  const cat = document.getElementById("cat-select").value;
  const kw = document.getElementById("search-input").value.trim().toLowerCase();
  const listContainer = document.getElementById("variable-list");

  state.filteredList = STATS_DATA.filter(item => {
    const matchCat = (cat === "すべての分野" || item.category === cat);
    const matchKw = (!kw || item.name.toLowerCase().includes(kw) || item.fullName.toLowerCase().includes(kw) || item.num.includes(kw));
    return matchCat && matchKw;
  });

  if (state.filteredList.length === 0) {
    listContainer.innerHTML = `
      <div style="padding:24px 16px; text-align:center; color:#94a3b8; font-size:0.8rem;">
        <i class="fa-solid fa-magnifying-glass" style="font-size:1.4rem; margin-bottom:8px; display:block; opacity:0.5;"></i>
        <span>該当する統計指標が見つかりません</span>
      </div>
    `;
    syncSliderUI();
    return;
  }

  listContainer.innerHTML = state.filteredList.map(item => `
    <div class="variable-item ${item.id === state.activeVarId ? 'selected' : ''}" data-id="${item.id}">
      <div style="display:flex; align-items:center; overflow:hidden;">
        <span class="var-badge">No.${item.num}</span>
        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
      </div>
      <span style="font-size:0.7rem; color:#94a3b8; margin-left:6px; flex-shrink:0;">${item.unit || ''}</span>
    </div>
  `).join("");

  listContainer.querySelectorAll(".variable-item").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      selectVariable(id, false); // リスト直接クリック時は余計なスクロールを避ける
    });
  });

  // 絞り込み後、現在選択中の指標が filteredList に含まれていなければ先頭を選択
  const exists = state.filteredList.some(item => item.id === state.activeVarId);
  if (!exists && state.filteredList.length > 0) {
    selectVariable(state.filteredList[0].id, true);
  } else {
    syncSliderUI();
  }
}

function selectVariable(varId, scrollIntoView = true) {
  state.activeVarId = varId;

  document.querySelectorAll(".variable-item").forEach(el => {
    const isSelected = el.getAttribute("data-id") === varId;
    el.classList.toggle("selected", isSelected);
    if (isSelected && scrollIntoView) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });

  document.querySelectorAll(".quick-tag").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-id") === varId);
  });

  syncSliderUI();
  updateLeafletMap();
  updateInfoPanels();
}

function updateInfoPanels() {
  const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
  if (!currentVar) return;

  const effective = getEffectiveData(currentVar);
  const stats = state.currentStats || computeStats(effective);

  document.getElementById("active-var-title-text").textContent = currentVar.name;
  document.getElementById("active-var-unit-pill").textContent = effective.unit ? `単位: ${effective.unit}` : "単位なし";

  document.getElementById("selected-var-num").textContent = `No.${currentVar.num} [${currentVar.category}]`;
  document.getElementById("selected-var-name").textContent = currentVar.name;
  document.getElementById("selected-var-source").textContent = currentVar.source ? `出典: ${currentVar.source}` : "";

  document.getElementById("float-stat-mean").textContent = formatNum(stats.mean);
  document.getElementById("float-stat-median").textContent = formatNum(stats.median);
  document.getElementById("float-stat-max-val").textContent = formatNum(stats.max.val);
  document.getElementById("float-stat-max-muni").textContent = `(${stats.max.muni})`;
  document.getElementById("float-stat-min-val").textContent = formatNum(stats.min.val);
  document.getElementById("float-stat-min-muni").textContent = `(${stats.min.muni})`;

  const topListEl = document.getElementById("float-rank-top");
  const top3 = stats.sorted.slice(0, 3);
  topListEl.innerHTML = top3.map((item, idx) => `
    <li class="rank-item-mini">
      <div>
        <span class="rank-badge rank-${idx + 1}">${idx + 1}</span>
        <strong>${item.muni}</strong>
      </div>
      <span>${formatNum(item.val)}</span>
    </li>
  `).join("");

  const btmListEl = document.getElementById("float-rank-btm");
  const btm3 = stats.sorted.slice(-3).reverse();
  btmListEl.innerHTML = btm3.map(item => `
    <li class="rank-item-mini">
      <div>
        <span class="rank-badge">${stats.ranks[item.muni]}</span>
        <span>${item.muni}</span>
      </div>
      <span>${formatNum(item.val)}</span>
    </li>
  `).join("");
}

/* ==========================================================================
   SVG Vector Map Generator (for crisp A4 Portrait Report with TRUE Mercator Aspect Ratio)
   ========================================================================== */
function renderReportSvgMap(varItem, breaks, paletteKey) {
  const effective = getEffectiveData(varItem);

  const minLon = 139.8601;
  const maxLon = 141.6826;
  const minLat = 40.2178;
  const maxLat = 41.5559;

  function latToMerc(latDeg) {
    const latRad = (latDeg * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  }

  const yMinMerc = latToMerc(minLat);
  const yMaxMerc = latToMerc(maxLat);

  const lonSpan = ((maxLon - minLon) * Math.PI) / 180;
  const mercYSpan = yMaxMerc - yMinMerc;

  // 縦置きA4の地図枠に最適化した等角メルカトル投影（共通スケールで歪みゼロ）
  const pad = 10;
  const mapW = 480;
  const scale = mapW / lonSpan;
  const mapH = mercYSpan * scale;

  const svgW = mapW + pad * 2;
  const svgH = mapH + pad * 2;

  function project(lon, lat) {
    const lonRad = ((lon - minLon) * Math.PI) / 180;
    const x = pad + lonRad * scale;
    const mercY = latToMerc(lat);
    const y = pad + (yMaxMerc - mercY) * scale;
    return [x, y];
  }

  let pathsHtml = "";

  // 1. 各市町村ポリゴン
  AOMORI_GEOJSON.features.forEach(feat => {
    const muniName = feat.properties.name;
    const val = effective.data[muniName];
    const fillColor = getColorForValue(val, breaks, paletteKey);
    const strokeInfo = getBorderStrokeForFeature(fillColor);

    let pathD = "";
    const geom = feat.geometry;

    function ringToPath(ring) {
      let d = "";
      ring.forEach((pt, i) => {
        const [x, y] = project(pt[0], pt[1]);
        d += (i === 0 ? "M " : "L ") + x.toFixed(1) + " " + y.toFixed(1) + " ";
      });
      d += "Z ";
      return d;
    }

    if (geom.type === "Polygon") {
      geom.coordinates.forEach(ring => {
        pathD += ringToPath(ring);
      });
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach(polygon => {
        polygon.forEach(ring => {
          pathD += ringToPath(ring);
        });
      });
    }

    pathsHtml += `<path d="${pathD}" fill="${fillColor}" stroke="${strokeInfo.color}" stroke-width="${(strokeInfo.weight * 0.8).toFixed(1)}" stroke-opacity="0.9" stroke-linejoin="round" />`;
  });

  // 2. 外周県境境界線
  const outerGeo = getOuterBorderGeoJSON(AOMORI_GEOJSON);
  let outerPathD = "";
  if (outerGeo && outerGeo.features && outerGeo.features[0]) {
    const lines = outerGeo.features[0].geometry.coordinates;
    lines.forEach(seg => {
      const p1 = project(seg[0][0], seg[0][1]);
      const p2 = project(seg[1][0], seg[1][1]);
      outerPathD += `M ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
    });
  }

  const outerSvg = outerPathD ? `<path d="${outerPathD}" fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />` : "";

  return `
    <svg viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block; background:#ffffff;">
      <g>${pathsHtml}</g>
      <g>${outerSvg}</g>
    </svg>
  `;
}

/* ==========================================================================
   Distribution Chart Generator (Histogram & KDE) - 元のツール仕様 (極値・同値安全対応)
   ========================================================================== */
function buildReportDistributionSVG(nums, min, mean, median, max, width = 310, height = 96, unitStr = "", formatValFn = null) {
  if (!nums || nums.length < 3) {
    return `<svg width="${width}" height="${height}"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#94a3b8">データ不足（3件以上必要）</text></svg>`;
  }
  const valFmt = typeof formatValFn === "function" ? formatValFn : formatNum;
  const n = nums.length;
  const range = (max - min) || 1;

  // 7 Bins (ヒストグラム階級分割)
  const numBins = 7;
  const binWidth = range / numBins;
  const bins = Array(numBins).fill(0);

  nums.forEach(v => {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    bins[idx]++;
  });
  const maxBinCount = Math.max(...bins, 1);

  // カーネル密度推定 (KDE) - Silverman's rule of thumb (0除算・NaN完全防止ガード)
  const variance = nums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1 || 1);
  const sd = Math.sqrt(variance) || 1;
  const q1 = computePercentile(nums, 0.25);
  const q3 = computePercentile(nums, 0.75);
  const iqr = (q3 - q1) || sd;
  
  let bw = 0.9 * Math.min(sd, (iqr / 1.34) || sd) * Math.pow(n, -0.2);
  if (!bw || isNaN(bw) || bw <= 0) {
    bw = (range / 8) || 1;
  }

  const pts = 60;
  const kdePoints = [];
  let kdeScaledMax = 0;

  for (let p = 0; p <= pts; p++) {
    const xVal = min + (range / pts) * p;
    let density = 0;
    nums.forEach(xi => {
      const u = (xVal - xi) / bw;
      density += (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * u * u);
    });
    density = density / (n * bw); // 確率密度 f(x)
    
    // 度数スケール換算 (期待度数密度 = density * n * binWidth)
    const scaledDensity = density * n * binWidth;
    if (scaledDensity > kdeScaledMax) kdeScaledMax = scaledDensity;
    kdePoints.push({ xVal, density, scaledDensity });
  }

  // Y軸上限
  const peakVal = Math.max(maxBinCount, kdeScaledMax);
  let yMax = Math.ceil(peakVal * 1.18);
  if (yMax < 2) yMax = 2;

  const padL = 26;
  const padR = 12;
  const padT = 16;
  const padB = 14;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  let svgInner = '';

  // 1. Y軸度数グリッド線 & 基準線
  const midCount = Math.round(yMax / 2);
  const midY = padT + chartH - (midCount / yMax) * chartH;

  // ベースライン (0)
  svgInner += `<line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#334155" stroke-width="1.2" />`;
  // 中間度数破線
  svgInner += `<line x1="${padL}" y1="${midY.toFixed(1)}" x2="${padL + chartW}" y2="${midY.toFixed(1)}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3" />`;
  // 上端破線
  svgInner += `<line x1="${padL}" y1="${padT}" x2="${padL + chartW}" y2="${padT}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2,2" />`;

  // Y軸度数ラベル
  svgInner += `<text x="${padL - 4}" y="${padT + chartH + 3}" font-size="7" fill="#475569" text-anchor="end">0</text>`;
  svgInner += `<text x="${padL - 4}" y="${(midY + 3).toFixed(1)}" font-size="7" fill="#475569" text-anchor="end">${midCount}</text>`;
  svgInner += `<text x="${padL - 4}" y="${padT + 3}" font-size="7" fill="#475569" text-anchor="end">${yMax}</text>`;

  // 2. ヒストグラムの描画
  const barWidth = chartW / numBins;
  bins.forEach((count, i) => {
    const barH = (count / yMax) * chartH;
    const x = padL + i * barWidth + 1;
    const y = padT + chartH - barH;
    const w = Math.max(barWidth - 2, 2);

    svgInner += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" fill="#f1f5f9" stroke="#334155" stroke-width="1.1" rx="1" />`;
    if (count > 0) {
      svgInner += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" font-size="7.5" fill="#0f172a" text-anchor="middle" font-weight="700">${count}</text>`;
    }
  });

  // 3. カーネル密度推定 (KDE) 曲線
  let pathD = `M `;
  kdePoints.forEach((pt, idx) => {
    const x = padL + ((pt.xVal - min) / range) * chartW;
    const y = padT + chartH - (pt.scaledDensity / yMax) * chartH;
    pathD += `${idx === 0 ? '' : 'L '}${x.toFixed(1)},${y.toFixed(1)} `;
  });

  svgInner += `<path d="${pathD}" fill="none" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round" />`;

  // 4. 平均値・中央値のリファレンス垂直線
  const meanX = padL + Math.max(0, Math.min(1, (mean - min) / range)) * chartW;
  const medianX = padL + Math.max(0, Math.min(1, (median - min) / range)) * chartW;
  const closeTogether = Math.abs(meanX - medianX) < 40;

  const getAnchor = (x) => {
    if (x < padL + 20) return "start";
    if (x > padL + chartW - 20) return "end";
    return "middle";
  };
  let meanAnchor = getAnchor(meanX);
  let medianAnchor = getAnchor(medianX);

  let meanY = padT - 3;
  let medianY = padT - 3;
  if (closeTogether) {
    if (meanX <= medianX) {
      meanY = padT - 11;
      medianY = padT - 1;
      if (Math.abs(meanX - medianX) < 16) {
        meanAnchor = "end";
        medianAnchor = "start";
      }
    } else {
      medianY = padT - 11;
      meanY = padT - 1;
      if (Math.abs(meanX - medianX) < 16) {
        medianAnchor = "end";
        meanAnchor = "start";
      }
    }
  }

  // 平均値線（黒破線）
  svgInner += `<line x1="${meanX.toFixed(1)}" y1="${padT}" x2="${meanX.toFixed(1)}" y2="${padT + chartH}" stroke="#0f172a" stroke-width="1.3" stroke-dasharray="3,2" />`;
  svgInner += `<text x="${meanX.toFixed(1)}" y="${meanY}" font-size="7" fill="#0f172a" text-anchor="${meanAnchor}" font-weight="700" paint-order="stroke fill" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round">平均:${valFmt(mean)}</text>`;

  // 中央値線（濃灰破線）
  svgInner += `<line x1="${medianX.toFixed(1)}" y1="${padT}" x2="${medianX.toFixed(1)}" y2="${padT + chartH}" stroke="#475569" stroke-width="1.3" stroke-dasharray="2,2" />`;
  svgInner += `<text x="${medianX.toFixed(1)}" y="${medianY}" font-size="7" fill="#475569" text-anchor="${medianAnchor}" font-weight="700" paint-order="stroke fill" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round">中央:${valFmt(median)}</text>`;

  // 5. X軸目盛りラベル
  const unitLabel = unitStr ? ` (${unitStr})` : '';
  svgInner += `<text x="${padL}" y="${height - 2}" text-anchor="start" font-size="6.8" font-weight="600" fill="#334155">最小: ${valFmt(min)}${unitLabel}</text>`;
  svgInner += `<text x="${padL + chartW}" y="${height - 2}" text-anchor="end" font-size="6.8" font-weight="600" fill="#334155">最大: ${valFmt(max)}${unitLabel}</text>`;

  return `
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="overflow:visible; display:block;">
    ${svgInner}
  </svg>`;
}

/* ==========================================================================
   Municipalities Vertical Bar Chart Generator (40 Municipalities in Descending Order) - 元のツール仕様 (全正・正負混在・全負完全対応)
   ========================================================================== */
function buildMuniVerticalBarChartSVG(sortedDescList, formatReportVal, axisUnitStr, width = 630, height = 200, mean = null, breaks = null, paletteKey = null) {
  if (!sortedDescList || sortedDescList.length === 0) {
    return `<svg width="${width}" height="${height}"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="11" fill="#94a3b8">有効なデータがありません</text></svg>`;
  }

  const validVals = sortedDescList.map(item => item.val).filter(v => v !== null && v !== undefined && !isNaN(v));
  const maxVal = validVals.length > 0 ? Math.max(...validVals) : 0;
  const minVal = validVals.length > 0 ? Math.min(...validVals) : 0;
  const range = (maxVal - minVal) || 1;

  const padL = 44;
  const padR = 12;
  const padT = 18;
  const padB = 62; // 市町村名ラベル用領域
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const n = sortedDescList.length;
  const colStep = chartW / n;
  const barW = Math.max(5, Math.min(10.5, colStep - 3.2));

  const hasNeg = minVal < 0;
  const hasPos = maxVal > 0;

  // 原点0のY座標計算（全正、正負混在、全負の各ケースに完全対応）
  let zeroY = padT + chartH;
  if (hasNeg && hasPos) {
    zeroY = padT + (maxVal / range) * chartH;
  } else if (hasNeg && !hasPos) {
    // 全て負値の場合、上端（padT）が0の基準
    zeroY = padT;
  } else {
    // 全て正値の場合、下端（padT + chartH）が0の基準
    zeroY = padT + chartH;
  }

  let svgInner = '';

  // 水平グリッド線 ＆ Y軸ラベル (0%, 25%, 50%, 75%, 100%)
  const numGridLines = 4;
  for (let i = 0; i <= numGridLines; i++) {
    const ratio = i / numGridLines;
    const y = padT + chartH * (1 - ratio);
    const gridVal = hasNeg ? (minVal + range * ratio) : (maxVal * ratio);

    svgInner += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + chartW}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="${i === 0 ? 'none' : '2,2'}" />`;
    svgInner += `<text x="${padL - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="7.2" font-family="ui-monospace, monospace" fill="#64748b">${formatReportVal(gridVal)}</text>`;
  }

  // 正負混在時の原点0基準線
  if (hasNeg && hasPos) {
    svgInner += `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${padL + chartW}" y2="${zeroY.toFixed(1)}" stroke="#94a3b8" stroke-width="1.2" />`;
  }

  // 平均値基準線
  if (mean !== null && !isNaN(mean)) {
    let meanY;
    if (hasNeg) {
      meanY = padT + ((maxVal - mean) / range) * chartH;
    } else {
      meanY = padT + chartH - (mean / (maxVal || 1)) * chartH;
    }
    if (meanY >= padT && meanY <= padT + chartH) {
      svgInner += `<line x1="${padL}" y1="${meanY.toFixed(1)}" x2="${padL + chartW}" y2="${meanY.toFixed(1)}" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="4,2" />`;
      svgInner += `<text x="${padL + chartW - 2}" y="${(meanY - 3).toFixed(1)}" text-anchor="end" font-size="7.5" font-weight="700" fill="#dc2626" paint-order="stroke fill" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round">平均: ${formatReportVal(mean)}</text>`;
    }
  }

  // 40本の垂直バーと市町村名ラベル
  sortedDescList.forEach((item, idx) => {
    const rank = idx + 1;
    const name = item.muni;
    const val = item.val;
    const color = (val !== null && !isNaN(val) && breaks) ? getColorForValue(val, breaks, paletteKey) : "#cbd5e1";

    const cx = padL + colStep * idx + colStep / 2;
    const x = cx - barW / 2;

    let barY = zeroY;
    let barH = 0;

    if (val !== null && !isNaN(val)) {
      if (!hasNeg) {
        barH = maxVal > 0 ? (val / maxVal) * chartH : 0;
        barY = padT + chartH - barH;
      } else if (hasNeg && hasPos) {
        if (val >= 0) {
          barH = (val / range) * chartH;
          barY = zeroY - barH;
        } else {
          barH = (Math.abs(val) / range) * chartH;
          barY = zeroY;
        }
      } else {
        // 全て負値の場合
        barH = (Math.abs(val) / (Math.abs(minVal) || 1)) * chartH;
        barY = padT;
      }
    }

    barH = Math.max(1.5, barH);

    // バー矩形（最小階級が白色でもくっきり見えるよう濃いスレートグレーで縁取り）
    svgInner += `<rect x="${x.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="1.5" ry="1.5" fill="${color}" stroke="#334155" stroke-width="0.9">
      <title>${rank}位: ${name} (${formatReportVal(val)})</title>
    </rect>`;

    // 市町村名（縦書き・90度回転で美しく下部に整列）
    const labelY = padT + chartH + 7;
    svgInner += `<text x="${cx.toFixed(1)}" y="${labelY}" transform="rotate(90, ${cx.toFixed(1)}, ${labelY})" text-anchor="start" font-size="8.2" font-weight="600" fill="#1e293b" letter-spacing="-0.02em">${name}</text>`;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="overflow:hidden; max-height:100%; display:block;">
      ${svgInner}
    </svg>
  `;
}

function openReportModal() {
  const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
  if (!currentVar) return;

  const effective = getEffectiveData(currentVar);
  const stats = state.currentStats || computeStats(effective);
  const breaks = state.currentBreaks || computeQuantileBreaks(stats.sorted, 5);

  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  document.getElementById("rep-target-var-name").textContent = currentVar.name;
  document.getElementById("rep-unit-text").textContent = effective.unit ? `（単位: ${effective.unit}）` : "";
  
  const repBadge = document.getElementById("rep-per-capita-badge");
  if (repBadge) {
    repBadge.style.display = state.isPerCapita ? "inline-block" : "none";
  }

  document.getElementById("rep-date-text").textContent = `作成日: ${dateStr}`;
  
  let sourceText = currentVar.source || "令和8年 青森県統計年鑑";
  if (state.isPerCapita) {
    sourceText += "（※人口補正基準: 令和2年国勢調査確定人口）";
  }
  document.getElementById("rep-source-text").textContent = sourceText;

  // 正確なアスペクト比でベクターマップを生成（縦置き大画面）
  const mapSvgWrapper = document.getElementById("rep-map-render-target");
  mapSvgWrapper.innerHTML = renderReportSvgMap(currentVar, breaks, state.activePalette);

  const colors = PALETTES[state.activePalette].colors;
  let legendItems = "";
  for (let i = 0; i < colors.length; i++) {
    legendItems += `
      <div style="display:flex; align-items:center; gap:4px;">
        <span style="display:inline-block; width:12px; height:9px; background:${colors[i]}; border:1px solid #334155; border-radius:2px;"></span>
        <span>${formatLegendLabel(breaks, i, colors.length)}</span>
      </div>
    `;
  }
  document.getElementById("rep-legend-items").innerHTML = legendItems;

  // 基本統計サマリー表
  document.getElementById("rep-stat-count").textContent = `${stats.count} / 40`;
  
  // 比率データ（人口1,000人あたり）のときは合計値を対象外表示にする
  if (state.isPerCapita) {
    document.getElementById("rep-stat-sum").innerHTML = `- <span style="font-size:0.62rem; color:#64748b; font-weight:normal;">(対象外)</span>`;
  } else {
    document.getElementById("rep-stat-sum").textContent = formatNum(stats.sum);
  }

  document.getElementById("rep-stat-mean").textContent = formatNum(stats.mean);
  document.getElementById("rep-stat-median").textContent = formatNum(stats.median);
  document.getElementById("rep-stat-max").innerHTML = `${formatNum(stats.max.val)}<span class="muni-tag">(${stats.max.muni})</span>`;
  document.getElementById("rep-stat-min").innerHTML = `${formatNum(stats.min.val)}<span class="muni-tag">(${stats.min.muni})</span>`;
  document.getElementById("rep-stat-sd").textContent = formatNum(stats.stdDev);
  document.getElementById("rep-stat-iqr").textContent = formatNum(stats.iqr);

  const statSubEl = document.getElementById("rep-stat-subtitle");
  if (statSubEl) {
    statSubEl.textContent = state.isPerCapita ? "(人口1,000人対)" : "(実測値)";
  }

  const statNoteEl = document.getElementById("rep-stat-note");
  if (statNoteEl) {
    statNoteEl.innerHTML = state.isPerCapita
      ? `※平均値は各市町村の単純算術平均（人口加重なし）<br>※人口補正基準: 令和2年(2020年)国勢調査確定人口`
      : "";
  }

  // 中段右: データ分布 (KDE + ヒストグラム)
  const distModeLabel = document.getElementById("rep-dist-mode-label");
  if (distModeLabel) {
    distModeLabel.textContent = state.isPerCapita ? "(1,000人あたり)" : "(実測値)";
  }
  const distSvgWrap = document.getElementById("rep-dist-render-target");
  if (distSvgWrap) {
    distSvgWrap.innerHTML = buildReportDistributionSVG(stats.numList, stats.min.val, stats.mean, stats.median, stats.max.val, 310, 96, effective.unit, formatNum);
  }

  // 下段: 40市町村 棒グラフ (多い順)
  const barUnitLabel = document.getElementById("rep-bar-unit-label");
  if (barUnitLabel) {
    barUnitLabel.textContent = effective.unit ? `[${effective.unit}]` : (state.isPerCapita ? "(1,000人あたり)" : "(実測値)");
  }
  const vbarSvgWrap = document.getElementById("rep-vbar-render-target");
  if (vbarSvgWrap) {
    vbarSvgWrap.innerHTML = buildMuniVerticalBarChartSVG(stats.sorted, formatNum, effective.unit, 630, 200, stats.mean, breaks, state.activePalette);
  }

  const footerNote = document.getElementById("rep-footer-note");
  if (footerNote) {
    footerNote.textContent = state.isPerCapita
      ? "分析対象: 青森県全40市町村（令和2年国勢調査人口による人口1,000人あたり換算値）"
      : "分析対象: 青森県全40市町村（40市町村の有効データを集計）";
  }

  document.getElementById("report-modal").classList.remove("hidden");
}

/* ==========================================================================
   Image Export / Clipboard (シャドウ退避・高精細PNG出力)
   ========================================================================== */
async function saveReportAsPNG() {
  const sheet = document.getElementById("report-sheet");
  if (!sheet) return;

  if (typeof html2canvas !== "function") {
    alert("画像出力ライブラリが読み込まれていません。ブラウザの印刷機能をご利用ください。");
    return;
  }

  // レポート用紙の外枠シャドウを一時解除してクリーンな白地画像にする
  const prevBoxShadow = sheet.style.boxShadow;
  sheet.style.boxShadow = "none";

  try {
    const canvas = await html2canvas(sheet, {
      scale: 2.0,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false
    });

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
    let varName = currentVar ? currentVar.name.replace(/[\/\:\*\?\"\<\>\|]/g, "_") : "レポート";
    if (state.isPerCapita) varName += "_人口1000人対";

    link.download = `青森県市町村データ100_${varName}_A4レポート_縦.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error("PNG export error:", err);
    alert("画像の保存に失敗しました: " + err.message);
  } finally {
    sheet.style.boxShadow = prevBoxShadow;
  }
}

async function copyReportToClipboard() {
  const sheet = document.getElementById("report-sheet");
  if (!sheet) return;

  if (typeof html2canvas !== "function") {
    alert("画像出力ライブラリが読み込まれていません。");
    return;
  }

  // レポート用紙の外枠シャドウを一時解除
  const prevBoxShadow = sheet.style.boxShadow;
  sheet.style.boxShadow = "none";

  try {
    const canvas = await html2canvas(sheet, {
      scale: 2.0,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false
    });

    canvas.toBlob(async blob => {
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([
            new window.ClipboardItem({ "image/png": blob })
          ]);
          alert("レポート画像をクリップボードにコピーしました！資料にそのまま貼り付けできます。");
        } catch (copyErr) {
          console.error("Clipboard write error:", copyErr);
          alert("クリップボードへの書き込みに失敗しました: " + copyErr.message);
        }
      } else {
        alert("お使いのブラウザはクリップボードへの画像コピーに対応していません。");
      }
    }, "image/png");
  } catch (err) {
    console.error("Copy image error:", err);
    alert("クリップボードへのコピーに失敗しました: " + err.message);
  } finally {
    sheet.style.boxShadow = prevBoxShadow;
  }
}

// アプリ起動
window.addEventListener("DOMContentLoaded", () => {
  initLeafletMap();
  initUI();
  setTimeout(() => {
    fitMapToContainer();
  }, 80);
});
