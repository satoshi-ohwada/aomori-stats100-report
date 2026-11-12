/**
 * 青森県統計年鑑　市町村データ100
 * Application Logic
 */

// 令和7年(2025年)国勢調査確定人口マスター（青森県40市町村）
const CENSUS_POPULATION_2025 = {
  "青森市": 255953,
  "弘前市": 155880,
  "八戸市": 205130,
  "黒石市": 28873,
  "五所川原市": 47462,
  "十和田市": 56718,
  "三沢市": 37090,
  "むつ市": 49674,
  "つがる市": 27025,
  "平川市": 28708,
  "平内町": 9121,
  "今別町": 1888,
  "蓬田村": 2254,
  "外ヶ浜町": 4510,
  "鰺ヶ沢町": 7745,
  "深浦町": 6259,
  "西目屋村": 1121,
  "藤崎町": 14094,
  "大鰐町": 7601,
  "田舎館村": 6846,
  "板柳町": 11518,
  "鶴田町": 10750,
  "中泊町": 8154,
  "野辺地町": 11173,
  "七戸町": 13098,
  "六戸町": 9948,
  "横浜町": 3818,
  "東北町": 14870,
  "六ヶ所村": 10553,
  "おいらせ町": 23652,
  "大間町": 4088,
  "東通村": 5189,
  "風間浦村": 1381,
  "佐井村": 1467,
  "三戸町": 7955,
  "五戸町": 14318,
  "田子町": 4343,
  "南部町": 15174,
  "階上町": 12211,
  "新郷村": 1849
};
const CENSUS_POPULATION_2020 = CENSUS_POPULATION_2025; // 互換性のためのエイリアス

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

// アプリケーション状態
const state = {
  activeVarId: "var_2", // 初期指標: 人口
  isPerCapita: false,   // 人口1,000人あたり補正モード（false: 実測値, true: 人口1,000人あたり）
  mapStyle: "choropleth",  // 作図形式: "choropleth" (エリア塗り分け) または "bubble" (バブル表示)
  activePalette: "blue",
  filteredList: [],
  leafletMap: null,
  geoJsonLayer: null,
  outerBorderLayer: null,
  bubbleLayerGroup: null,  // バブル表示用レイヤーグループ
  legendControl: null,
  showMuniNames: false,       // 現在の市町村名ラベル表示フラグ
  showValues: false,          // 現在の数値ラベル表示フラグ
  choroplethShowNames: false, // エリア塗り分け時の市町村名表示フラグ
  choroplethShowValues: false,// エリア塗り分け時の数値表示フラグ
  bubbleShowNames: true,      // バブル表示時の市町村名表示フラグ（デフォルトON）
  bubbleShowValues: true,     // バブル表示時の数値表示フラグ（デフォルトON）
  labelMarkersLayer: null,    // 市町村名・数値マーカー用レイヤーグループ
  currentBreaks: [],
  currentStats: null
};

// 狭小密集地域（鶴田町・板柳町・藤崎町・田舎館村）専用の引き出し線（Leader Line）設定
// target: ポリゴン内の幾何学的重心（引き出し線の起点ピンポイント）
// anchor: 周囲と干渉しない引き出し先座標（ラベル表示位置）
const LEADER_LINE_CONFIG = {
  // 津軽密集4町村：左右互い違いに引き出して重なりを完全解消
  "鶴田町": {
    target: [140.4212, 40.7565], // 重心
    anchor: [140.3550, 40.7750]  // 西（つがる市境側余白）へ引き出し
  },
  "板柳町": {
    target: [140.4811, 40.7156], // 重心
    anchor: [140.5550, 40.7300]  // 東（青森市境・梵珠山麓側余白）へ引き出し
  },
  "藤崎町": {
    target: [140.5166, 40.6752], // 重心
    anchor: [140.4200, 40.6650]  // 西（岩木川右岸・弘前市北部側余白）へ引き出し
  },
  "田舎館村": {
    target: [140.5417, 40.6421], // 重心
    anchor: [140.5750, 40.6180]  // 南東（平川境側余白）へ引き出し（黒石市と完全分離）
  },
  // 上十三密集2町：北西と南東に引き出して重なりを完全解消
  "六戸町": {
    target: [141.3188, 40.6318], // 重心
    anchor: [141.2650, 40.6450]  // 北西（十和田・東北町境側余白）へ引き出し（おいらせ町と完全分離）
  },
  "おいらせ町": {
    target: [141.4037, 40.6274], // 重心
    anchor: [141.4550, 40.6050]  // 南東（太平洋沿岸部余白）へ引き出し（六戸町と完全分離）
  }
};

// 青森県40市町村 ラベル表示用代表座標（経度, 緯度）
// 幾何学的重心を基準とし、全県40市町村のバウンディングボックス衝突判定に基づく全域最適化済み座標
// 密集町村（鶴田・板柳・藤崎・田舎館・六戸・おいらせ）は引き出し線先アンカー座標へ配置
const MUNI_LABEL_COORDS = {
  "青森市": [140.7542, 40.7701],      // 幾何学的重心
  "弘前市": [140.3650, 40.5950],      // 市街幾何重心（藤崎町とのクリアランス確保）
  "八戸市": [141.5050, 40.5200],      // 中心市街・港湾部（南部町・階上町との重複を完全解消）
  "黒石市": [140.7600, 40.6450],      // 市域東部盆地（田舎館村との重複を完全解消）
  "五所川原市": [140.4900, 40.8550],  // 本庁部幾何重心
  "十和田市": [141.0570, 40.5668],    // 幾何学的重心
  "三沢市": [141.4000, 40.7350],      // 市街・沿岸部（東北町とのクリアランス確保）
  "むつ市": [141.0800, 41.2750],      // 陸奥湾入を考慮したポリゴン内重心近く
  "つがる市": [140.3150, 40.8750],    // 幾何学的重心（五所川原市とのクリアランス確保）
  "平川市": [140.7100, 40.5300],      // 市街東部（大鰐町とのクリアランス確保）
  "平内町": [140.9562, 40.9077],      // 幾何学的重心
  "今別町": [140.5163, 41.1603],      // 幾何学的重心
  "蓬田村": [140.6100, 40.9850],      // 沿岸部重心（中泊町とのクリアランス確保）
  "外ヶ浜町": [140.5850, 41.0850],    // 蟹田部幾何重心近く（主要部内）
  "鰺ヶ沢町": [140.1867, 40.6514],    // 幾何学的重心
  "深浦町": [140.0183, 40.6049],      // 幾何学的重心
  "西目屋村": [140.2370, 40.5106],    // 幾何学的重心
  "鶴田町": [140.3550, 40.7750],      // 【引き出し線】西側へ引き出し配置
  "板柳町": [140.5550, 40.7300],      // 【引き出し線】東側へ引き出し配置
  "藤崎町": [140.4200, 40.6650],      // 【引き出し線】西側へ引き出し配置
  "田舎館村": [140.5750, 40.6180],    // 【引き出し線】南東側へ引き出し配置（黒石市と完全分離）
  "大鰐町": [140.5514, 40.4841],      // 幾何学的重心
  "中泊町": [140.4400, 41.0150],      // 中里部重心（蓬田村とのクリアランス確保）
  "野辺地町": [141.1350, 40.8650],    // 陸地重心（野辺地湾出を回避）
  "七戸町": [141.0787, 40.7316],      // 幾何学的重心
  "六戸町": [141.2650, 40.6450],      // 【引き出し線】北西側へ引き出し配置（おいらせ町と完全分離）
  "横浜町": [141.2850, 41.0670],      // 幾何学的重心
  "東北町": [141.2347, 40.7955],      // 幾何学的重心
  "六ヶ所村": [141.3311, 40.9568],    // 幾何学的重心
  "おいらせ町": [141.4550, 40.6050],  // 【引き出し線】南東沿岸へ引き出し配置（六戸町と完全分離）
  "大間町": [140.9050, 41.5200],      // 大間崎側（風間浦村と完全分離）
  "東通村": [141.3519, 41.2783],      // 幾何学的重心
  "風間浦村": [141.0450, 41.4450],    // 東部沿岸側（大間町と完全分離）
  "佐井村": [140.8552, 41.3527],      // 幾何学的重心
  "三戸町": [141.1756, 40.3771],      // 幾何学的重心
  "五戸町": [141.2967, 40.5082],      // 幾何学的重心
  "田子町": [141.0499, 40.3091],      // 幾何学的重心
  "南部町": [141.3471, 40.4222],      // 幾何学的重心
  "階上町": [141.5950, 40.4150],      // 南東部（八戸市と完全分離）
  "新郷村": [141.1076, 40.4473]       // 幾何学的重心
};

// 指標がすでに単位あたり（率・比率・人口当たり・面積当たり・指数等）に変換されているか判定
function isAlreadyPerCapitaOrRate(varItem) {
  if (!varItem) return false;
  const u = varItem.unit || "";
  const n = varItem.name || "";
  if (u === "%" || u === "‰" || u === "人口千人対" || u === "人/k㎡") return true;
  if (/率|割合|当たり|あたり|対|指数|密度/.test(n)) return true;
  if (/率|割合|当たり|あたり|対|指数|密度/.test(u)) return true;
  return false;
}

// 実効データの取得（実測値 or 人口1,000人あたり）
function getEffectiveData(varItem) {
  if (!varItem) return { data: {}, unit: "", isPerCapita: false };

  // 比率・単位あたり指標の場合は二重補正を防ぐため常に原数値（実測値）
  if (!state.isPerCapita || isAlreadyPerCapitaOrRate(varItem)) {
    return {
      data: varItem.data,
      unit: varItem.unit || "",
      isPerCapita: false
    };
  }

  // 人口1,000人あたり変換: (val / pop2025) * 1000
  const transformed = {};
  for (const [muni, val] of Object.entries(varItem.data)) {
    const pop = CENSUS_POPULATION_2025[muni];
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

// 輝度に応じたコントラスト文字色の判定（暗い背景には白文字、明るい背景には濃色文字）
function getContrastingTextColor(hex) {
  const rgb = hexToRgb(hex || "#ffffff");
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return lum < 135 ? "#ffffff" : "#0f172a";
}

// 市町村境界線スタイル計算（濃い色および2番目に濃い色では白線にし、見やすい視認性に最適化）
function getBorderStrokeForFeature(fillColor) {
  if (!fillColor || fillColor === "transparent") {
    return { color: "#475569", weight: 1.2 };
  }
  const rgb = hexToRgb(fillColor || "#ffffff");
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  // 5段階パレットの第4階級（2番目に濃い色: lum約96〜123）および第5階級（最も濃い色: lum約58〜79）で白線に切替
  const isDarkOrSecondDark = (lum < 135);

  if (isDarkOrSecondDark) {
    return { color: "#ffffff", weight: 1.5 };
  }
  return { color: "#475569", weight: 1.15 };
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
  state.bubbleLayerGroup = L.layerGroup().addTo(map);

  const legend = L.control({ position: "topright" });
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
  
  // 右側凡例（幅約185px）と程よい間隔を保ちつつ、下北半島や八戸方面が重ならないよう東側パディングを設定
  state.leafletMap.fitBounds(bounds, {
    paddingTopLeft: [10, 10],      // [x(左), y(上)]
    paddingBottomRight: [120, 10], // [x(右), y(下)]: 東側に約120pxのパディングを設けて凡例と心地よい間隔で配置
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

  const isBubble = (state.mapStyle === "bubble");

  // 1. 各市町村ポリゴンの描画
  state.geoJsonLayer = L.geoJSON(AOMORI_GEOJSON, {
    style: function(feature) {
      const muniName = feature.properties.name;
      const val = effective.data[muniName];

      if (isBubble) {
        // バブル表示時は背景として淡い白地図スタイルで描画
        return {
          fillColor: "#f8fafc",
          fillOpacity: 0.85,
          color: "#cbd5e1",
          weight: 1.0,
          opacity: 0.9
        };
      }

      // エリア塗り分け（標準）
      const fillColor = getColorForValue(val, breaks, state.activePalette);
      const strokeInfo = getBorderStrokeForFeature(fillColor);

      return {
        fillColor: fillColor,
        fillOpacity: 0.92,
        color: strokeInfo.color,
        weight: strokeInfo.weight,
        opacity: 0.95
      };
    },
    onEachFeature: function(feature, layer) {
      const muniName = feature.properties.name;
      const val = effective.data[muniName];
      const rank = stats.ranks[muniName];

      const totalValid = stats.count || 40;
      const rankScope = totalValid === 40 ? "全40市町村中" : `対象${totalValid}市町村中`;
      const rankStr = rank ? `（${rankScope} 第 <strong style="color:#2563eb;">${rank}</strong> 位）` : "";
      const valStr = val !== null && val !== undefined ? `${formatNum(val)} <span style="font-size:0.8rem; font-weight:normal;">${effective.unit}</span>` : "データなし";

      let popInfo = "";
      if (state.isPerCapita) {
        const rawVal = currentVar.data[muniName];
        popInfo = `<div style="font-size:0.72rem; color:#64748b; margin-top:2px;">(実測値: ${formatNum(rawVal)} ${currentVar.unit || ''} / 2025年人口: ${formatNum(CENSUS_POPULATION_2025[muniName])}人)</div>`;
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
            weight: isBubble ? 1.5 : 2.2,
            color: isBubble ? "#94a3b8" : "#1e293b",
            fillOpacity: isBubble ? 0.95 : 0.96
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

  // 2. 外周県境境界線の描画（最前面：程よく引き締める外枠）
  const outerGeoJSON = getOuterBorderGeoJSON(AOMORI_GEOJSON);
  if (outerGeoJSON) {
    state.outerBorderLayer = L.geoJSON(outerGeoJSON, {
      style: {
        color: isBubble ? "#94a3b8" : "#1e293b",
        weight: isBubble ? 1.4 : 1.75,
        fill: false,
        opacity: 0.92
      },
      interactive: false
    }).addTo(state.leafletMap);
    state.outerBorderLayer.bringToFront();
  }

  fitMapToContainer();

  updateLegendUI(breaks, effective.unit, stats);

  // 3. レイヤー切り替え（バブル表示 vs エリア塗り分けラベル）
  if (isBubble) {
    if (state.labelMarkersLayer) state.labelMarkersLayer.clearLayers();
    renderBubbleLayer(currentVar, breaks, stats);
  } else {
    if (state.bubbleLayerGroup) state.bubbleLayerGroup.clearLayers();
    renderMapLabels();
  }
}

// バブル表示レイヤー描画（フォースレイアウト衝突回避・引き出し線付き）
function renderBubbleLayer(currentVar, breaks, stats) {
  if (!state.leafletMap) return;

  if (state.bubbleLayerGroup) {
    state.leafletMap.removeLayer(state.bubbleLayerGroup);
    state.bubbleLayerGroup = null;
  }

  if (state.mapStyle !== "bubble") return;

  // 常に最前面レイヤーグループとしてマップに追加
  state.bubbleLayerGroup = L.layerGroup().addTo(state.leafletMap);

  const effective = getEffectiveData(currentVar);
  const colors = PALETTES[state.activePalette].colors;
  const numClasses = colors.length;

  // 1. 各自治体の初期ノード構築
  const nodes = [];
  for (const [muni, coords] of Object.entries(MUNI_LABEL_COORDS)) {
    // MUNI_LABEL_COORDS は [経度(lon), 緯度(lat)] なので Leaflet の [lat, lon] に正しく変換
    const latLng = L.latLng(coords[1], coords[0]);
    const pt = state.leafletMap.latLngToLayerPoint(latLng);
    const val = effective.data[muni];
    const rank = stats.ranks[muni];

    // 階級ステップ（0〜4）
    let stepIdx = -1;
    if (val !== null && val !== undefined && !isNaN(val)) {
      for (let i = 0; i < numClasses; i++) {
        if (val <= breaks[i + 1] || i === numClasses - 1) {
          stepIdx = i;
          break;
        }
      }
    }

    // 半径の決定（階級ステップ連動: 最小14px 〜 最大23px）
    let r = 16;
    if (stepIdx >= 0) {
      r = Math.round(14 + stepIdx * 2.25);
    }

    // 中核都市はアンカーとして位置を安定化
    const isAnchor = (muni === "弘前市" || muni === "青森市" || muni === "八戸市");

    nodes.push({
      muni,
      latlng: latLng,
      origX: pt.x,
      origY: pt.y,
      x: pt.x,
      y: pt.y,
      r,
      val,
      stepIdx,
      rank,
      isAnchor
    });
  }

  // 2. 力学シミュレーション（フォースレイアウトによる衝突回避）
  const ITERATIONS = 120;
  const PADDING = 2.5;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const alpha = Math.pow(1.0 - (iter / ITERATIONS), 1.2);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.r + b.r + PADDING;

        if (dist < minDist) {
          if (dist === 0) {
            dx = (Math.random() - 0.5) * 2;
            dy = (Math.random() - 0.5) * 2;
            dist = Math.sqrt(dx * dx + dy * dy) || 1;
          }

          const overlap = minDist - dist;
          const fx = (dx / dist) * overlap * 0.5;
          const fy = (dy / dist) * overlap * 0.5;

          if (a.isAnchor && !b.isAnchor) {
            b.x -= fx * 1.8;
            b.y -= fy * 1.8;
            a.x += fx * 0.2;
            a.y += fy * 0.2;
          } else if (!a.isAnchor && b.isAnchor) {
            a.x += fx * 1.8;
            a.y += fy * 1.8;
            b.x -= fx * 0.2;
            b.y -= fy * 0.2;
          } else {
            a.x += fx;
            a.y += fy;
            b.x -= fx;
            b.y -= fy;
          }
        }
      }
    }

    // 重心への復元引力と最大変位制限
    nodes.forEach(node => {
      const spring = node.isAnchor ? 0.06 : 0.035;
      node.x += (node.origX - node.x) * spring * alpha;
      node.y += (node.origY - node.y) * spring * alpha;

      const offX = node.x - node.origX;
      const offY = node.y - node.origY;
      const distFromOrig = Math.sqrt(offX * offX + offY * offY);
      const maxOffset = node.isAnchor ? 12 : 55;
      if (distFromOrig > maxOffset) {
        const s = maxOffset / distFromOrig;
        node.x = node.origX + offX * s;
        node.y = node.origY + offY * s;
      }
    });
  }

  // 3. レイヤー描画（引き出し線 ＋ 起点ドット ＋ バブルマーカー）
  nodes.forEach(node => {
    const targetPt = L.point(node.x, node.y);
    const targetLatLng = state.leafletMap.layerPointToLatLng(targetPt);
    const distFromOrig = Math.sqrt(Math.pow(node.x - node.origX, 2) + Math.pow(node.y - node.origY, 2));

    // 8px 以上移動した場合は引き出し線と起点ドットを描画
    if (distFromOrig >= 8) {
      L.circleMarker(node.latlng, {
        radius: 2.2,
        fillColor: "#475569",
        color: "#ffffff",
        weight: 1,
        fillOpacity: 0.9,
        interactive: false
      }).addTo(state.bubbleLayerGroup);

      L.polyline([node.latlng, targetLatLng], {
        color: "#64748b",
        weight: 1.2,
        opacity: 0.8,
        dashArray: "3,3",
        interactive: false
      }).addTo(state.bubbleLayerGroup);
    }

    // バブルの塗り色と文字色
    const fillColor = (node.stepIdx >= 0) ? colors[node.stepIdx] : "#e2e8f0";
    const textColor = getContrastingTextColor(fillColor);
    const strokeBorder = (textColor === "#0f172a") ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.9)";

    // 自治体名略称（「市」「町」「村」を除去した名前）
    const shortName = node.muni.replace(/(?:市|町|村)$/, "");
    const charLen = shortName.length;

    let nameFontSize = Math.max(7.2, Math.min(10.5, (node.r * 1.5) / Math.max(1.8, charLen)));
    let valFontSize = Math.max(6.0, Math.min(8.5, node.r * 0.45));

    const formattedVal = (node.val !== null && !isNaN(node.val)) ? formatNum(node.val) : "-";

    // バブル内のテキスト生成（ステップ4の選択に応じて市町村名・数値を表示/非表示）
    let innerTextHtml = "";
    if (state.showMuniNames && state.showValues) {
      // 両方表示（上段：自治体略称、下段：数値）
      innerTextHtml = `
        <span class="bubble-muni-name" style="font-size: ${nameFontSize.toFixed(1)}px;">${shortName}</span>
        <span class="bubble-muni-val" style="font-size: ${valFontSize.toFixed(1)}px;">${formattedVal}</span>
      `;
    } else if (state.showMuniNames) {
      // 自治体名のみ表示（中央配置、やや大きめのフォント）
      const singleNameSize = Math.max(8.2, Math.min(12.5, (node.r * 1.6) / Math.max(1.8, charLen)));
      innerTextHtml = `
        <span class="bubble-muni-name" style="font-size: ${singleNameSize.toFixed(1)}px; line-height: 1.1;">${shortName}</span>
      `;
    } else if (state.showValues) {
      // 数値のみ表示（中央配置、やや大きめのフォント）
      const singleValSize = Math.max(7.8, Math.min(12.0, node.r * 0.68));
      innerTextHtml = `
        <span class="bubble-muni-val" style="font-size: ${singleValSize.toFixed(1)}px; line-height: 1.1; margin-top: 0;">${formattedVal}</span>
      `;
    }
    // 両方OFFの場合は innerTextHtml = "" となり、純粋な5段階サイズのカラーバブル（円）のみを描画

    const bubbleHtml = `
      <div class="bubble-circle" style="
        width: ${node.r * 2}px;
        height: ${node.r * 2}px;
        background: ${fillColor};
        border: 1.5px solid ${strokeBorder};
        color: ${textColor};
      ">
        ${innerTextHtml}
      </div>
    `;

    const icon = L.divIcon({
      className: "bubble-marker-wrap",
      html: bubbleHtml,
      iconSize: [node.r * 2, node.r * 2],
      iconAnchor: [node.r, node.r]
    });

    const marker = L.marker(targetLatLng, { 
      icon: icon,
      zIndexOffset: 1000 
    }).addTo(state.bubbleLayerGroup);

    // ツールチップ設定
    const totalValid = stats.count || 40;
    const rankScope = totalValid === 40 ? "全40市町村中" : `対象${totalValid}市町村中`;
    const rankStr = node.rank ? `（${rankScope} 第 <strong style="color:#2563eb;">${node.rank}</strong> 位）` : "";
    const valStr = node.val !== null && node.val !== undefined ? `${formatNum(node.val)} <span style="font-size:0.8rem; font-weight:normal;">${effective.unit}</span>` : "データなし";
    marker.bindTooltip(`
      <div class="tooltip-muni-name">${node.muni}</div>
      <div class="tooltip-val">${valStr}</div>
      <div class="tooltip-rank">${rankStr}</div>
    `, {
      className: "muni-tooltip",
      direction: "top",
      offset: [0, -node.r]
    });
  });
}

// ステップ4のUI表示更新（作図形式に応じて見出し・説明文・チェックボックス状態を切り替え）
function updateStep4UI() {
  const isBubble = (state.mapStyle === "bubble");

  const titleEl = document.getElementById("step4-title");
  const descEl = document.getElementById("step4-desc");
  const namesTitleEl = document.getElementById("toggle-names-title");
  const namesSubEl = document.getElementById("toggle-names-sub");
  const valuesTitleEl = document.getElementById("toggle-values-title");
  const valuesSubEl = document.getElementById("toggle-values-sub");
  const cardNames = document.getElementById("sidebar-toggle-names");
  const cardValues = document.getElementById("sidebar-toggle-values");
  const chkNames = document.getElementById("chk-show-names-sidebar");
  const chkValues = document.getElementById("chk-show-values-sidebar");

  if (isBubble) {
    if (titleEl) titleEl.textContent = "バブル内テキスト表示";
    if (descEl) descEl.textContent = "バブル内の市町村名・数値を調整";
    if (namesTitleEl) namesTitleEl.textContent = "市町村名を表示";
    if (namesSubEl) namesSubEl.textContent = "バブル内に自治体名（略称）を表示";
    if (valuesTitleEl) valuesTitleEl.textContent = "数値を表示";
    if (valuesSubEl) valuesSubEl.textContent = "バブル内に統計数値を表示";
    if (cardNames) cardNames.title = "バブル内に市町村名（略称）を表示/非表示";
    if (cardValues) cardValues.title = "バブル内に統計数値を表示/非表示";
  } else {
    if (titleEl) titleEl.textContent = "地図ラベル表示";
    if (descEl) descEl.textContent = "市町村名・数値を地図に表示";
    if (namesTitleEl) namesTitleEl.textContent = "市町村名を表示";
    if (namesSubEl) namesSubEl.textContent = "全40自治体の名称を地図上に表示";
    if (valuesTitleEl) valuesTitleEl.textContent = "数値を表示";
    if (valuesSubEl) valuesSubEl.textContent = "現在の統計数値を地図上に表示";
    if (cardNames) cardNames.title = "市町村名を地図上に直接表示/非表示";
    if (cardValues) cardValues.title = "数値を地図上に直接表示/非表示";
  }

  // 現在の state.showMuniNames / state.showValues に合わせてチェックボックスとカードの見た目を同期
  if (chkNames) chkNames.checked = state.showMuniNames;
  if (cardNames) cardNames.classList.toggle("active", state.showMuniNames);
  if (chkValues) chkValues.checked = state.showValues;
  if (cardValues) cardValues.classList.toggle("active", state.showValues);
}

// 市町村名ラベル（またはバブル内自治体名）の表示切替
function toggleMuniNames(show) {
  state.showMuniNames = show;
  if (state.mapStyle === "bubble") {
    state.bubbleShowNames = show;
  } else {
    state.choroplethShowNames = show;
  }

  const chkSide = document.getElementById("chk-show-names-sidebar");
  const cardSide = document.getElementById("sidebar-toggle-names");

  if (chkSide) chkSide.checked = show;
  if (cardSide) cardSide.classList.toggle("active", show);

  if (state.mapStyle === "bubble") {
    const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
    if (currentVar) {
      const effective = getEffectiveData(currentVar);
      const stats = state.currentStats || computeStats(effective);
      const breaks = (state.currentBreaks && state.currentBreaks.length) ? state.currentBreaks : computeSmartBreaks(stats.sorted, 5);
      renderBubbleLayer(currentVar, breaks, stats);
    }
  } else {
    renderMapLabels();
  }
}

// 数値ラベル（またはバブル内数値）の表示切替
function toggleValues(show) {
  state.showValues = show;
  if (state.mapStyle === "bubble") {
    state.bubbleShowValues = show;
  } else {
    state.choroplethShowValues = show;
  }

  const chkSide = document.getElementById("chk-show-values-sidebar");
  const cardSide = document.getElementById("sidebar-toggle-values");

  if (chkSide) chkSide.checked = show;
  if (cardSide) cardSide.classList.toggle("active", show);

  if (state.mapStyle === "bubble") {
    const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
    if (currentVar) {
      const effective = getEffectiveData(currentVar);
      const stats = state.currentStats || computeStats(effective);
      const breaks = (state.currentBreaks && state.currentBreaks.length) ? state.currentBreaks : computeSmartBreaks(stats.sorted, 5);
      renderBubbleLayer(currentVar, breaks, stats);
    }
  } else {
    renderMapLabels();
  }
}

// 地図上ラベルの描画（市町村名・数値を別々または両方表示、狭小町村は引き出し線付き）
function renderMapLabels() {
  if (!state.leafletMap) return;

  if (state.labelMarkersLayer) {
    state.leafletMap.removeLayer(state.labelMarkersLayer);
    state.labelMarkersLayer = null;
  }

  // 市町村名も数値も両方OFFなら何もしない
  if (!state.showMuniNames && !state.showValues) return;

  const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
  if (!currentVar) return;
  const effective = getEffectiveData(currentVar);

  const markers = [];

  // 1. 狭小密集地域（鶴田町・板柳町・藤崎町・田舎館村）の引き出し線描画
  Object.keys(LEADER_LINE_CONFIG).forEach(muniName => {
    const cfg = LEADER_LINE_CONFIG[muniName];

    // 引き出し線（上品な破線）
    const line = L.polyline([
      [cfg.target[1], cfg.target[0]],
      [cfg.anchor[1], cfg.anchor[0]]
    ], {
      color: "#334155",
      weight: 1.2,
      opacity: 0.85,
      dashArray: "3, 2",
      interactive: false
    });
    markers.push(line);

    // 重心地点のピンポイント丸印
    const dot = L.circleMarker([cfg.target[1], cfg.target[0]], {
      radius: 2.2,
      color: "#0f172a",
      weight: 1.0,
      fillColor: "#ffffff",
      fillOpacity: 1.0,
      interactive: false
    });
    markers.push(dot);
  });

  // 2. 各市町村ラベルマーカーの描画
  Object.keys(MUNI_LABEL_COORDS).forEach(muniName => {
    const coords = MUNI_LABEL_COORDS[muniName];
    const val = effective.data[muniName];
    const valStr = val !== null && val !== undefined ? formatNum(val) : "-";

    let innerHtml = "";
    let contentClass = "map-label-content";

    if (state.showMuniNames && state.showValues) {
      // 両方表示（2段組）
      contentClass += " dual-label";
      innerHtml = `
        <div class="muni-name">${muniName}</div>
        <div class="muni-val">${valStr}</div>
      `;
    } else if (state.showMuniNames) {
      // 市町村名のみ（1行コンパクト）
      contentClass += " single-label only-name";
      innerHtml = `<span class="muni-name">${muniName}</span>`;
    } else if (state.showValues) {
      // 数値のみ（1行コンパクト）
      contentClass += " single-label only-val";
      innerHtml = `<span class="muni-val">${valStr}</span>`;
    }

    const html = `<div class="${contentClass}">${innerHtml}</div>`;

    const icon = L.divIcon({
      className: "map-muni-label-marker",
      html: html,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    const marker = L.marker([coords[1], coords[0]], {
      icon: icon,
      interactive: false,
      keyboard: false
    });
    markers.push(marker);
  });

  state.labelMarkersLayer = L.layerGroup(markers).addTo(state.leafletMap);
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

// 凡例用 ミニ箱ひげ図（Box Plot + ドット散布）SVG生成
function buildLegendBoxplotSVG(stats, unit, width = 82, height = 116) {
  if (!stats || !stats.sorted || stats.sorted.length === 0 || stats.min.val === null || stats.max.val === null) {
    return `<div style="font-size:0.65rem; color:#94a3b8; text-align:center; padding:18px 0;">データなし</div>`;
  }

  const min = stats.min.val;
  const max = stats.max.val;
  const q1 = stats.q1;
  const q3 = stats.q3;
  const median = stats.median;
  const iqr = stats.iqr;
  const numList = stats.sorted; // { muni, val }

  const padTop = 8;
  const padBottom = 8;
  const drawHeight = height - padTop - padBottom;
  const range = max - min;

  function getY(val) {
    if (range === 0) return padTop + drawHeight / 2;
    return padTop + (1 - (val - min) / range) * drawHeight;
  }

  const minY = getY(min);
  const maxY = getY(max);
  const q1Y = getY(q1);
  const q3Y = getY(q3);
  const medY = getY(median);

  // Tukey Whiskers (1.5 * IQR)
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  let lowerWhiskerVal = min;
  let upperWhiskerVal = max;

  for (const item of numList) {
    if (item.val >= lowerFence && item.val < q1) {
      lowerWhiskerVal = Math.min(lowerWhiskerVal, item.val);
    }
    if (item.val <= upperFence && item.val > q3) {
      upperWhiskerVal = Math.max(upperWhiskerVal, item.val);
    }
  }

  const whiskerBottomY = getY(lowerWhiskerVal);
  const whiskerTopY = getY(upperWhiskerVal);

  const boxCenterX = 15;
  const boxW = 12;
  const boxLeft = boxCenterX - boxW / 2;

  // 1. ひげ線
  const whiskerLine = `
    <line x1="${boxCenterX}" y1="${whiskerTopY.toFixed(1)}" x2="${boxCenterX}" y2="${q3Y.toFixed(1)}" stroke="#475569" stroke-width="1.1" />
    <line x1="${boxCenterX}" y1="${q1Y.toFixed(1)}" x2="${boxCenterX}" y2="${whiskerBottomY.toFixed(1)}" stroke="#475569" stroke-width="1.1" />
    <line x1="${(boxCenterX - 4.5).toFixed(1)}" y1="${whiskerTopY.toFixed(1)}" x2="${(boxCenterX + 4.5).toFixed(1)}" y2="${whiskerTopY.toFixed(1)}" stroke="#475569" stroke-width="1.3" />
    <line x1="${(boxCenterX - 4.5).toFixed(1)}" y1="${whiskerBottomY.toFixed(1)}" x2="${(boxCenterX + 4.5).toFixed(1)}" y2="${whiskerBottomY.toFixed(1)}" stroke="#475569" stroke-width="1.3" />
  `;

  // 2. 箱 (Q1〜Q3)
  const boxHeight = Math.max(2, q1Y - q3Y);
  const boxSvg = `
    <rect x="${boxLeft.toFixed(1)}" y="${q3Y.toFixed(1)}" width="${boxW}" height="${boxHeight.toFixed(1)}"
          fill="rgba(59, 130, 246, 0.16)" stroke="#2563eb" stroke-width="1.3" rx="1.5">
      <title>四分位範囲 (Q1〜Q3): ${formatNum(q1)} 〜 ${formatNum(q3)} [IQR: ${formatNum(iqr)}]</title>
    </rect>
  `;

  // 3. 中央値ライン
  const medSvg = `
    <line x1="${boxLeft.toFixed(1)}" y1="${medY.toFixed(1)}" x2="${(boxLeft + boxW).toFixed(1)}" y2="${medY.toFixed(1)}" stroke="#ea580c" stroke-width="2.2" stroke-linecap="round">
      <title>中央値 (Median): ${formatNum(median)} ${unit}</title>
    </line>
  `;

  // 4. 40自治体ドットプロット（Strip/Jitter）
  const dotXBase = 35;
  let dotsSvg = "";
  numList.forEach((item, idx) => {
    const py = getY(item.val);
    let charSum = 0;
    for (let c = 0; c < item.muni.length; c++) charSum += item.muni.charCodeAt(c);
    const jitterX = dotXBase + ((charSum % 13) - 6);
    const isOutlier = (item.val < lowerFence || item.val > upperFence);

    dotsSvg += `
      <circle cx="${jitterX.toFixed(1)}" cy="${py.toFixed(1)}" r="${isOutlier ? 2.9 : 2.1}"
              class="boxplot-dot"
              fill="${isOutlier ? '#ef4444' : '#334155'}"
              fill-opacity="${isOutlier ? 0.9 : 0.55}"
              stroke="#ffffff" stroke-width="0.5">
        <title>${item.muni}: ${formatNum(item.val)} ${unit} (${idx + 1}位)${isOutlier ? ' [外れ値]' : ''}</title>
      </circle>
    `;
  });

  // 5. ラベルテキスト（Max, Med, Min）
  const textX = width - 1;
  const labelsSvg = `
    <text x="${textX}" y="${Math.min(padTop + 6, maxY + 2.5).toFixed(1)}" text-anchor="end" font-size="7.3" fill="#64748b" font-weight="600">Max ${formatNum(max)}</text>
    <text x="${textX}" y="${(medY + 2.4).toFixed(1)}" text-anchor="end" font-size="7.3" fill="#ea580c" font-weight="bold">中 ${formatNum(median)}</text>
    <text x="${textX}" y="${Math.max(height - padBottom + 1.5, minY + 1.5).toFixed(1)}" text-anchor="end" font-size="7.3" fill="#64748b" font-weight="600">Min ${formatNum(min)}</text>
  `;

  return `
    <svg class="legend-boxplot-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="overflow:visible;">
      <!-- ガイド点線 (Max, Med, Min) -->
      <line x1="${(boxCenterX - 5).toFixed(1)}" y1="${maxY.toFixed(1)}" x2="${(textX - 29).toFixed(1)}" y2="${maxY.toFixed(1)}" stroke="#e2e8f0" stroke-width="0.7" stroke-dasharray="2,2" />
      <line x1="${(boxLeft + boxW).toFixed(1)}" y1="${medY.toFixed(1)}" x2="${(textX - 29).toFixed(1)}" y2="${medY.toFixed(1)}" stroke="#fed7aa" stroke-width="0.7" stroke-dasharray="2,2" />
      <line x1="${(boxCenterX - 5).toFixed(1)}" y1="${minY.toFixed(1)}" x2="${(textX - 29).toFixed(1)}" y2="${minY.toFixed(1)}" stroke="#e2e8f0" stroke-width="0.7" stroke-dasharray="2,2" />

      <!-- ひげ・箱・中央値 -->
      ${whiskerLine}
      ${boxSvg}
      ${medSvg}

      <!-- 40自治体ドットプロット -->
      <g>${dotsSvg}</g>

      <!-- 数値ラベル -->
      ${labelsSvg}
    </svg>
  `;
}

function updateLegendUI(breaks, unit, stats = null) {
  const legendEl = document.getElementById("leaflet-legend-box");
  if (!legendEl) return;

  legendEl.classList.toggle("bubble-mode", state.mapStyle === "bubble");

  const currentStats = stats || state.currentStats;
  const colors = PALETTES[state.activePalette].colors;
  const unitStr = unit ? ` (${unit})` : "";

  // 1. 階級凡例行（上＝大きい値・濃い色、下＝小さい値・薄い色 で箱ひげ図と高さを完全連動）
  let classesHtml = "";
  const isUniform = breaks && breaks.length >= 2 && breaks[0] === breaks[breaks.length - 1];

  if (isUniform) {
    classesHtml += `
      <div class="legend-row">
        <div class="legend-color-box" style="background:${colors[colors.length - 1]}; border-color:#334155;"></div>
        <span>${formatLegendLabel(breaks, 0, colors.length)}</span>
      </div>
    `;
  } else {
    for (let i = colors.length - 1; i >= 0; i--) {
      classesHtml += `
        <div class="legend-row">
          <div class="legend-color-box" style="background:${colors[i]}; border-color:#334155;"></div>
          <span>${formatLegendLabel(breaks, i, colors.length)}</span>
        </div>
      `;
    }
  }

  classesHtml += `
    <div class="legend-row" style="margin-top:2px; padding-top:2px; border-top:1px dashed #e2e8f0; color:#64748b;">
      <div class="legend-color-box" style="background:#e2e8f0; border-color:#94a3b8;"></div>
      <span>データなし</span>
    </div>
  `;

  // 2. 箱ひげ図SVG（視認性向上版 82px x 116px）
  const boxplotSvg = buildLegendBoxplotSVG(currentStats, unit, 82, 116);

  // 3. 全体HTML（2カラムレイアウト）
  legendEl.innerHTML = `
    <div class="legend-header-flex">
      <span class="legend-title">階級凡例${unitStr}</span>
      <span class="legend-box-title">全体分布</span>
    </div>
    <div class="legend-content-flex">
      <div class="legend-classes-col">
        ${classesHtml}
      </div>
      <div class="legend-divider-v"></div>
      <div class="legend-boxplot-col">
        ${boxplotSvg}
      </div>
    </div>
  `;
}

/* ==========================================================================
   UI Controller & Event Bindings
   ========================================================================== */
function initUI() {
  const catSelect = document.getElementById("cat-select");
  const searchInput = document.getElementById("search-input");

  const categories = ["すべての分野", ...new Set(STATS_DATA.map(d => d.category))];
  catSelect.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join("");

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
    const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
    if (isPerCapita && isAlreadyPerCapitaOrRate(currentVar)) {
      return; // 単位あたり・比率指標は人口補正不可
    }
    state.isPerCapita = isPerCapita;
    btnModeRaw.classList.toggle("active", !isPerCapita);
    btnMode1000.classList.toggle("active", isPerCapita);

    updateLeafletMap();
    updateInfoPanels();
  }

  if (btnModeRaw) {
    btnModeRaw.addEventListener("click", () => setPerCapitaMode(false));
  }
  if (btnMode1000) {
    btnMode1000.addEventListener("click", () => setPerCapitaMode(true));
  }

  // 作図スタイル切り替え（エリア塗り分け vs バブル表示）
  const btnStyleChoropleth = document.getElementById("btn-style-choropleth");
  const btnStyleBubble = document.getElementById("btn-style-bubble");

  function setMapStyle(style) {
    if (state.mapStyle === style) return;

    // 以前のスタイルのラベル選択状態を保存
    if (state.mapStyle === "bubble") {
      state.bubbleShowNames = state.showMuniNames;
      state.bubbleShowValues = state.showValues;
    } else {
      state.choroplethShowNames = state.showMuniNames;
      state.choroplethShowValues = state.showValues;
    }

    state.mapStyle = style;

    // 新しいスタイルのラベル選択状態を復元（バブル初回はデフォルトON）
    if (style === "bubble") {
      state.showMuniNames = (state.bubbleShowNames !== undefined) ? state.bubbleShowNames : true;
      state.showValues = (state.bubbleShowValues !== undefined) ? state.bubbleShowValues : true;
    } else {
      state.showMuniNames = (state.choroplethShowNames !== undefined) ? state.choroplethShowNames : false;
      state.showValues = (state.choroplethShowValues !== undefined) ? state.choroplethShowValues : false;
    }

    if (btnStyleChoropleth) btnStyleChoropleth.classList.toggle("active", style === "choropleth");
    if (btnStyleBubble) btnStyleBubble.classList.toggle("active", style === "bubble");

    updateStep4UI();
    updateLeafletMap();
    updateInfoPanels();
  }

  if (btnStyleChoropleth) {
    btnStyleChoropleth.addEventListener("click", () => setMapStyle("choropleth"));
  }
  if (btnStyleBubble) {
    btnStyleBubble.addEventListener("click", () => setMapStyle("bubble"));
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

  // 市町村名・数値ラベルの個別表示切り替えチェックボックス（サイドバー）
  const chkShowNamesSidebar = document.getElementById("chk-show-names-sidebar");
  const chkShowValuesSidebar = document.getElementById("chk-show-values-sidebar");

  if (chkShowNamesSidebar) {
    chkShowNamesSidebar.addEventListener("change", e => {
      toggleMuniNames(e.target.checked);
    });
  }

  if (chkShowValuesSidebar) {
    chkShowValuesSidebar.addEventListener("change", e => {
      toggleValues(e.target.checked);
    });
  }

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
        updateLeafletMap();
      }, 260);
    });
  }

  window.addEventListener("resize", () => {
    updateLeafletMap();
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

  // 上下移動ナビゲーションボタンの登録
  const btnVarUp = document.getElementById("btn-var-up");
  const btnVarDown = document.getElementById("btn-var-down");

  if (btnVarUp) {
    btnVarUp.addEventListener("click", () => {
      if (!state.filteredList || state.filteredList.length === 0) return;
      const currentIdx = state.filteredList.findIndex(item => item.id === state.activeVarId);
      if (currentIdx > 0) {
        selectVariable(state.filteredList[currentIdx - 1].id, true);
      }
    });
  }

  if (btnVarDown) {
    btnVarDown.addEventListener("click", () => {
      if (!state.filteredList || state.filteredList.length === 0) return;
      const currentIdx = state.filteredList.findIndex(item => item.id === state.activeVarId);
      if (currentIdx < state.filteredList.length - 1) {
        selectVariable(state.filteredList[currentIdx + 1].id, true);
      }
    });
  }

  updateStep4UI();
  filterVariables();
  selectVariable(state.activeVarId, true);
}

// ステップ2の人口補正UI（ボタン活性状態・注意メッセージ）の同期制御
function syncPerCapitaUI(varItem) {
  const btnModeRaw = document.getElementById("btn-mode-raw");
  const btnMode1000 = document.getElementById("btn-mode-1000");
  const noteEl = document.querySelector(".per-capita-note");
  if (!btnModeRaw || !btnMode1000) return;

  const isRate = isAlreadyPerCapitaOrRate(varItem);

  if (isRate) {
    // 比率/単位あたり指標の場合：強制的に実測値モードにし、人口1,000人あたりボタンを無効化
    state.isPerCapita = false;
    btnModeRaw.classList.add("active");
    btnMode1000.classList.remove("active");
    btnMode1000.disabled = true;
    btnMode1000.classList.add("disabled");
    btnMode1000.title = "この指標はすでに単位あたり（比率・率・指数等）のため、人口補正はできません";
    if (noteEl) {
      noteEl.classList.add("rate-locked");
      noteEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> ※この指標はすでに単位あたり（比率）データのため、人口補正は不要です`;
    }
  } else {
    // 通常実数指標の場合：活性化
    btnMode1000.disabled = false;
    btnMode1000.classList.remove("disabled");
    btnMode1000.title = "令和7年国勢調査人口で割って1,000人あたりに変換します";
    btnModeRaw.classList.toggle("active", !state.isPerCapita);
    btnMode1000.classList.toggle("active", state.isPerCapita);
    if (noteEl) {
      noteEl.classList.remove("rate-locked");
      noteEl.innerHTML = `※令和7年(2025年)国勢調査人口を用いて自治体の人口規模差を補正します`;
    }
  }
}

// 選択中の現在位置カウンターおよび「上へ」「下へ」ボタンの活性状態を同期
function syncSliderUI() {
  const counter = document.getElementById("slider-counter");
  const btnUp = document.getElementById("btn-var-up");
  const btnDown = document.getElementById("btn-var-down");
  if (!state.filteredList) return;

  const total = state.filteredList.length;
  if (total === 0) {
    if (btnUp) btnUp.disabled = true;
    if (btnDown) btnDown.disabled = true;
    if (counter) counter.textContent = "0 / 0";
    return;
  }

  const currentIdx = state.filteredList.findIndex(item => item.id === state.activeVarId);
  const val = currentIdx >= 0 ? currentIdx + 1 : 1;

  if (counter) {
    counter.textContent = `No. ${val} / ${total}`;
  }
  if (btnUp) {
    btnUp.disabled = (val <= 1);
  }
  if (btnDown) {
    btnDown.disabled = (val >= total);
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

  listContainer.innerHTML = state.filteredList.map(item => {
    const isRate = isAlreadyPerCapitaOrRate(item);
    return `
    <div class="variable-item ${item.id === state.activeVarId ? 'selected' : ''}" data-id="${item.id}">
      <div style="display:flex; align-items:center; overflow:hidden;">
        <span class="var-badge">No.${item.num}</span>
        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
      </div>
      <div style="display:flex; align-items:center; gap:4px; margin-left:6px; flex-shrink:0;">
        ${isRate ? '<span class="rate-indicator-badge" title="すでに単位あたり・比率の指標です">比率</span>' : ''}
        <span style="font-size:0.7rem; color:#94a3b8;">${item.unit || ''}</span>
      </div>
    </div>
  `;
  }).join("");

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

  const currentVar = STATS_DATA.find(v => v.id === varId);
  syncPerCapitaUI(currentVar);
  syncSliderUI();
  updateLeafletMap();
  updateInfoPanels();
}

function updateInfoPanels() {
  const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
  if (!currentVar) return;

  const effective = getEffectiveData(currentVar);
  const stats = state.currentStats || computeStats(effective);

  const titleEl = document.getElementById("active-var-title-text");
  if (titleEl) {
    titleEl.textContent = currentVar.name;
    titleEl.title = currentVar.name; // ホバーで正式名称全文を確認可能
  }
  const numBadge = document.getElementById("active-var-num-badge");
  if (numBadge) {
    numBadge.textContent = `No.${currentVar.num}`;
  }
  const unitPill = document.getElementById("active-var-unit-pill");
  if (unitPill) {
    unitPill.textContent = effective.unit ? `単位: ${effective.unit}` : "単位なし";
  }

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

  const isBubble = (state.mapStyle === "bubble");
  let pathsHtml = "";

  // 1. 各市町村ポリゴン
  AOMORI_GEOJSON.features.forEach(feat => {
    const muniName = feat.properties.name;
    const val = effective.data[muniName];
    const fillColor = isBubble ? "#f8fafc" : getColorForValue(val, breaks, paletteKey);
    const strokeInfo = isBubble 
      ? { color: "#cbd5e1", weight: 0.8 } 
      : getBorderStrokeForFeature(fillColor);

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

    pathsHtml += `<path d="${pathD}" fill="${fillColor}" stroke="${strokeInfo.color}" stroke-width="${strokeInfo.weight}" stroke-opacity="0.95" stroke-linejoin="round" />`;
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

  const outerSvg = outerPathD ? `<path d="${outerPathD}" fill="none" stroke="${isBubble ? '#94a3b8' : '#1e293b'}" stroke-width="${isBubble ? '1.3' : '1.75'}" stroke-opacity="0.92" stroke-linecap="round" stroke-linejoin="round" />` : "";

  // 3. バブル表示 または 通常ラベル表示
  let labelsSvg = "";
  if (isBubble) {
    // --- バブル表示モード（SVGベクターレンダリング） ---
    const repColors = PALETTES[paletteKey].colors;
    const numClasses = repColors.length;

    // 初期ノード作成
    const nodes = [];
    for (const [muni, coords] of Object.entries(MUNI_LABEL_COORDS)) {
      const [ptX, ptY] = project(coords[0], coords[1]);
      const val = effective.data[muni];

      let stepIdx = -1;
      if (val !== null && val !== undefined && !isNaN(val)) {
        for (let i = 0; i < numClasses; i++) {
          if (val <= breaks[i + 1] || i === numClasses - 1) {
            stepIdx = i;
            break;
          }
        }
      }

      // レポートSVG用半径（9px〜16px）
      let r = 11;
      if (stepIdx >= 0) {
        r = 9 + stepIdx * 1.75;
      }

      const isAnchor = (muni === "弘前市" || muni === "青森市" || muni === "八戸市");
      nodes.push({
        muni,
        origX: ptX,
        origY: ptY,
        x: ptX,
        y: ptY,
        r,
        val,
        stepIdx,
        isAnchor
      });
    }

    // 衝突回避シミュレーション
    const ITER = 100;
    const PAD = 2.0;
    for (let iter = 0; iter < ITER; iter++) {
      const alpha = Math.pow(1.0 - (iter / ITER), 1.2);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + b.r + PAD;
          if (dist < minDist) {
            if (dist === 0) {
              dx = (Math.random() - 0.5) * 2;
              dy = (Math.random() - 0.5) * 2;
              dist = Math.sqrt(dx * dx + dy * dy) || 1;
            }
            const overlap = minDist - dist;
            const fx = (dx / dist) * overlap * 0.5;
            const fy = (dy / dist) * overlap * 0.5;
            if (a.isAnchor && !b.isAnchor) {
              b.x -= fx * 1.8; b.y -= fy * 1.8; a.x += fx * 0.2; a.y += fy * 0.2;
            } else if (!a.isAnchor && b.isAnchor) {
              a.x += fx * 1.8; a.y += fy * 1.8; b.x -= fx * 0.2; b.y -= fy * 0.2;
            } else {
              a.x += fx; a.y += fy; b.x -= fx; b.y -= fy;
            }
          }
        }
      }
      nodes.forEach(node => {
        const spring = node.isAnchor ? 0.06 : 0.035;
        node.x += (node.origX - node.x) * spring * alpha;
        node.y += (node.origY - node.y) * spring * alpha;
        const offX = node.x - node.origX;
        const offY = node.y - node.origY;
        const d = Math.sqrt(offX * offX + offY * offY);
        const maxOff = node.isAnchor ? 10 : 45;
        if (d > maxOff) {
          const s = maxOff / d;
          node.x = node.origX + offX * s;
          node.y = node.origY + offY * s;
        }
      });
    }

    // SVG要素組み立て
    let leaderSvg = "";
    let bubblesSvg = "";

    nodes.forEach(node => {
      const distFromOrig = Math.sqrt(Math.pow(node.x - node.origX, 2) + Math.pow(node.y - node.origY, 2));
      if (distFromOrig >= 6) {
        leaderSvg += `
          <line x1="${node.origX.toFixed(1)}" y1="${node.origY.toFixed(1)}" x2="${node.x.toFixed(1)}" y2="${node.y.toFixed(1)}" stroke="#64748b" stroke-width="0.8" stroke-dasharray="2,2" stroke-opacity="0.8"/>
          <circle cx="${node.origX.toFixed(1)}" cy="${node.origY.toFixed(1)}" r="1.5" fill="#475569" stroke="#ffffff" stroke-width="0.6"/>
        `;
      }

      const fillColor = (node.stepIdx >= 0) ? repColors[node.stepIdx] : "#e2e8f0";
      const textColor = getContrastingTextColor(fillColor);
      const strokeBorder = (textColor === "#0f172a") ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.95)";
      const shortName = node.muni.replace(/(?:市|町|村)$/, "");
      const valStr = (node.val !== null && !isNaN(node.val)) ? formatNum(node.val) : "-";

      const nameFontSize = Math.max(5.0, Math.min(7.2, (node.r * 1.3) / Math.max(1.8, shortName.length)));
      const valFontSize = Math.max(4.2, Math.min(5.8, node.r * 0.45));

      let textSvg = "";
      if (state.showMuniNames && state.showValues) {
        textSvg = `
          <text x="0" y="${(-node.r * 0.15).toFixed(1)}" text-anchor="middle" font-size="${nameFontSize.toFixed(1)}" font-weight="700" fill="${textColor}">${shortName}</text>
          <text x="0" y="${(node.r * 0.55).toFixed(1)}" text-anchor="middle" font-size="${valFontSize.toFixed(1)}" font-weight="600" fill="${textColor}">${valStr}</text>
        `;
      } else if (state.showMuniNames) {
        const singleNameSize = Math.max(5.8, Math.min(8.5, (node.r * 1.5) / Math.max(1.8, shortName.length)));
        textSvg = `
          <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${singleNameSize.toFixed(1)}" font-weight="700" fill="${textColor}">${shortName}</text>
        `;
      } else if (state.showValues) {
        const singleValSize = Math.max(5.2, Math.min(8.0, node.r * 0.65));
        textSvg = `
          <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${singleValSize.toFixed(1)}" font-weight="600" fill="${textColor}">${valStr}</text>
        `;
      }

      bubblesSvg += `
        <g transform="translate(${node.x.toFixed(1)}, ${node.y.toFixed(1)})" pointer-events="none">
          <circle cx="0" cy="0" r="${node.r.toFixed(1)}" fill="${fillColor}" stroke="${strokeBorder}" stroke-width="1.0" />
          ${textSvg}
        </g>
      `;
    });

    labelsSvg = leaderSvg + bubblesSvg;
  } else if (state.showMuniNames || state.showValues) {
    // 3-1. 狭小密集地域（鶴田町・板柳町・藤崎町・田舎館村）の引き出し線描画
    let leaderLinesSvg = "";
    Object.keys(LEADER_LINE_CONFIG).forEach(muniName => {
      const cfg = LEADER_LINE_CONFIG[muniName];
      const pTarget = project(cfg.target[0], cfg.target[1]);
      const pAnchor = project(cfg.anchor[0], cfg.anchor[1]);
      leaderLinesSvg += `
        <line x1="${pTarget[0].toFixed(1)}" y1="${pTarget[1].toFixed(1)}" x2="${pAnchor[0].toFixed(1)}" y2="${pAnchor[1].toFixed(1)}" stroke="#334155" stroke-width="0.8" stroke-dasharray="2.5, 1.5" stroke-opacity="0.85" pointer-events="none"/>
        <circle cx="${pTarget[0].toFixed(1)}" cy="${pTarget[1].toFixed(1)}" r="1.5" fill="#ffffff" stroke="#0f172a" stroke-width="0.7" pointer-events="none"/>
      `;
    });
    labelsSvg += leaderLinesSvg;

    // 3-2. 各市町村ラベル
    Object.keys(MUNI_LABEL_COORDS).forEach(muniName => {
      const coord = MUNI_LABEL_COORDS[muniName];
      const pt = project(coord[0], coord[1]);
      const val = effective.data[muniName];
      const valStr = val !== null && val !== undefined ? formatNum(val) : "-";

      if (state.showMuniNames && state.showValues) {
        // 両方表示（2段組）
        labelsSvg += `
          <g transform="translate(${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})" pointer-events="none">
            <rect x="-19" y="-9.5" width="38" height="19" rx="2.5" ry="2.5" fill="#ffffff" fill-opacity="0.90" stroke="#0f172a" stroke-width="0.5" stroke-opacity="0.25"/>
            <text x="0" y="-1.5" text-anchor="middle" font-size="5.8" font-weight="600" fill="#334155">${muniName}</text>
            <text x="0" y="6.5" text-anchor="middle" font-size="6.6" font-weight="700" fill="#0f172a">${valStr}</text>
          </g>
        `;
      } else if (state.showMuniNames) {
        // 市町村名のみ（1行）
        labelsSvg += `
          <g transform="translate(${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})" pointer-events="none">
            <rect x="-16" y="-6.5" width="32" height="13" rx="2" ry="2" fill="#ffffff" fill-opacity="0.90" stroke="#0f172a" stroke-width="0.5" stroke-opacity="0.25"/>
            <text x="0" y="2.5" text-anchor="middle" font-size="6.2" font-weight="600" fill="#334155">${muniName}</text>
          </g>
        `;
      } else if (state.showValues) {
        // 数値のみ（1行）
        labelsSvg += `
          <g transform="translate(${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})" pointer-events="none">
            <rect x="-16" y="-6.5" width="32" height="13" rx="2" ry="2" fill="#ffffff" fill-opacity="0.90" stroke="#0f172a" stroke-width="0.5" stroke-opacity="0.25"/>
            <text x="0" y="2.8" text-anchor="middle" font-size="6.8" font-weight="700" fill="#0f172a">${valStr}</text>
          </g>
        `;
      }
    });
  }

  // 4. 地図内 階級凡例（Map Inset Legend: 左上・北西日本海沖の広大なオープンスペースに配置）
  const legColors = PALETTES[paletteKey].colors;
  const legUnitStr = effective.unit ? ` (${effective.unit})` : "";
  const isUniform = breaks && breaks.length >= 2 && breaks[0] === breaks[breaks.length - 1];

  const legX = 14;
  const legY = 14;
  const legW = 98;
  const rowH = 11.2;
  const legH = isUniform ? 36.0 : (23.0 + legColors.length * rowH);

  let legendSvg = `
    <g class="rep-map-legend" transform="translate(${legX}, ${legY})" pointer-events="none">
      <rect x="0" y="0" width="${legW}" height="${legH.toFixed(1)}" rx="4" ry="4" fill="#ffffff" fill-opacity="0.95" stroke="#94a3b8" stroke-width="0.8" stroke-opacity="0.85"/>
      <text x="8" y="11.5" font-size="6.4" font-weight="700" fill="#1e293b">階級凡例${legUnitStr}</text>
      <line x1="8" y1="14.5" x2="${legW - 8}" y2="14.5" stroke="#cbd5e1" stroke-width="0.5"/>
  `;

  const symW = isBubble ? "7.5" : "11";
  const symH = isBubble ? "7.5" : "7";
  const symRx = isBubble ? "3.75" : "1";
  const symX = isBubble ? "1.8" : "0";
  const symY = isBubble ? "-0.2" : "0";

  if (isUniform) {
    legendSvg += `
      <g transform="translate(8, 20.5)">
        <rect x="${symX}" y="${symY}" width="${symW}" height="${symH}" rx="${symRx}" fill="${legColors[legColors.length - 1]}" stroke="#475569" stroke-width="0.5"/>
        <text x="15" y="5.8" font-size="5.4" font-weight="600" fill="#334155">${formatLegendLabel(breaks, 0, legColors.length)}</text>
      </g>
    `;
  } else {
    for (let i = 0; i < legColors.length; i++) {
      const curY = 20.5 + i * rowH;
      const lbl = formatLegendLabel(breaks, i, legColors.length);
      legendSvg += `
        <g transform="translate(8, ${curY.toFixed(1)})">
          <rect x="${symX}" y="${symY}" width="${symW}" height="${symH}" rx="${symRx}" fill="${legColors[i]}" stroke="#475569" stroke-width="0.5"/>
          <text x="15" y="5.8" font-size="5.4" font-weight="600" fill="#334155">${lbl}</text>
        </g>
      `;
    }
  }
  legendSvg += `</g>`;

  return `
    <svg viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block; background:#ffffff;">
      <g>${pathsHtml}</g>
      <g>${outerSvg}</g>
      <g>${labelsSvg}</g>
      <g>${legendSvg}</g>
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
  // 入力配列の正規化（数値配列または [{val}] オブジェクト配列の両方に完全対応）
  const cleanNums = nums
    .map(v => (typeof v === "object" && v !== null ? v.val : v))
    .filter(v => typeof v === "number" && !isNaN(v));

  if (cleanNums.length < 3) {
    return `<svg width="${width}" height="${height}"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#94a3b8">データ不足（3件以上必要）</text></svg>`;
  }

  const valFmt = typeof formatValFn === "function" ? formatValFn : formatNum;
  const n = cleanNums.length;
  const range = (max - min) || 1;

  // 7 Bins (ヒストグラム階級分割)
  const numBins = 7;
  const binWidth = range / numBins;
  const bins = Array(numBins).fill(0);

  cleanNums.forEach(v => {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    bins[idx]++;
  });
  const maxBinCount = Math.max(...bins, 1);

  // カーネル密度推定 (KDE) - Silverman's rule of thumb (0除算・NaN完全防止ガード)
  const variance = cleanNums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1 || 1);
  const sd = Math.sqrt(variance) || 1;
  const q1 = computePercentile(cleanNums, 0.25);
  const q3 = computePercentile(cleanNums, 0.75);
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
    cleanNums.forEach(xi => {
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
  const breaks = (state.currentBreaks && state.currentBreaks.length) ? state.currentBreaks : computeSmartBreaks(stats.sorted, 5);

  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  document.getElementById("rep-target-var-name").textContent = currentVar.name;
  document.getElementById("rep-unit-text").textContent = effective.unit ? `（単位: ${effective.unit}）` : "";

  document.getElementById("rep-date-text").textContent = `作成日: ${dateStr}`;
  
  let sourceText = currentVar.source || "令和8年 青森県統計年鑑";
  sourceText = sourceText.replace(/\u3000/g, " ");
  if (state.isPerCapita) {
    sourceText += "（人口補正: 令和7年国勢調査）";
  }
  document.getElementById("rep-source-text").textContent = sourceText;

  // 正確なアスペクト比でベクターマップを生成（縦置き大画面、インセット凡例内蔵）
  const mapSvgWrapper = document.getElementById("rep-map-render-target");
  mapSvgWrapper.innerHTML = renderReportSvgMap(currentVar, breaks, state.activePalette);

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
      ? `※平均値は各市町村の単純算術平均（人口加重なし）<br>※人口補正基準: 令和7年(2025年)国勢調査確定人口`
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
    if (state.isPerCapita) {
      footerNote.textContent = stats.count === 40
        ? "分析対象: 青森県全40市町村（令和7年国勢調査人口による人口1,000人あたり換算値）"
        : `分析対象: 青森県40市町村中、公表・有効データのある${stats.count}市町村（人口1,000人あたり換算値 / 一部非公表等）`;
    } else {
      footerNote.textContent = stats.count === 40
        ? "分析対象: 青森県全40市町村（40市町村の有効データを集計）"
        : `分析対象: 青森県40市町村中、公表・有効データのある${stats.count}市町村（一部自治体は秘匿・非公表等でデータなし）`;
    }
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
