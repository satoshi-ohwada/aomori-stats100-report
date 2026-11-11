/**
 * 青森県 市町村データ100 かんたんマップ＆レポート
 * Application Logic
 */

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
  activePalette: "blue",
  filteredList: [],
  leafletMap: null,
  geoJsonLayer: null,
  legendControl: null,
  currentBreaks: [],
  currentStats: null
};

// 数値フォーマッタ
function formatNum(val, decimals = null) {
  if (val === null || val === undefined || isNaN(val)) return "-";
  if (decimals !== null) {
    return Number(val).toLocaleString("ja-JP", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
  // 小数がある場合は最大2桁、整数の場合は整数表示
  if (val % 1 !== 0) {
    return Number(val).toLocaleString("ja-JP", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    });
  }
  return Number(val).toLocaleString("ja-JP");
}

// 統計量の計算
function computeStats(varItem) {
  const entries = [];
  for (const [muni, val] of Object.entries(varItem.data)) {
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
      min: { muni: "-", val: null },
      max: { muni: "-", val: null },
      sorted: [],
      ranks: {}
    };
  }

  // 降順ソート（1位が最大）
  entries.sort((a, b) => b.val - a.val);

  // 順位付け
  const ranks = {};
  entries.forEach((item, idx) => {
    ranks[item.muni] = idx + 1;
  });

  const vals = entries.map(e => e.val);
  const sum = vals.reduce((a, b) => a + b, 0);
  const mean = sum / vals.length;

  // 中央値
  let median = 0;
  const n = vals.length;
  if (n % 2 === 1) {
    median = vals[Math.floor(n / 2)];
  } else {
    median = (vals[n / 2 - 1] + vals[n / 2]) / 2;
  }

  return {
    count: n,
    sum: sum,
    mean: mean,
    median: median,
    max: entries[0],
    min: entries[entries.length - 1],
    sorted: entries,
    ranks: ranks
  };
}

// 5段階の分位数（Quantile）階級分割
function computeQuantileBreaks(sortedEntries, k = 5) {
  if (!sortedEntries || sortedEntries.length === 0) return [0, 0, 0, 0, 0, 0];
  // 昇順に並べ替え
  const vals = sortedEntries.map(e => e.val).sort((a, b) => a - b);
  const n = vals.length;
  const breaks = [vals[0]];

  for (let i = 1; i < k; i++) {
    const p = i / k;
    const idx = (n - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    const bVal = vals[lower] * (1 - weight) + vals[upper] * weight;
    breaks.push(bVal);
  }
  breaks.push(vals[n - 1]);

  // 重複値の調整
  for (let i = 1; i < breaks.length; i++) {
    if (breaks[i] <= breaks[i - 1]) {
      breaks[i] = breaks[i - 1] + 0.0001;
    }
  }

  return breaks;
}

// 値に対応する色の取得
function getColorForValue(val, breaks, paletteKey) {
  if (val === null || val === undefined || isNaN(val)) {
    return "#e2e8f0"; // 欠損値は薄いグレー
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
   Leaflet Map Control
   ========================================================================== */
function initLeafletMap() {
  // 青森県全体の初期中心座標とズームレベル
  const map = L.map("map-view", {
    center: [40.78, 140.75],
    zoom: 9,
    minZoom: 8,
    maxZoom: 14,
    zoomControl: false,
    attributionControl: false
  });

  // ズームコントロールを左上に配置
  L.control.zoom({ position: "topleft" }).addTo(map);

  state.leafletMap = map;

  // 凡例コントロールの追加
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function() {
    const div = L.DomUtil.create("div", "map-legend-control");
    div.id = "leaflet-legend-box";
    return div;
  };
  legend.addTo(map);
  state.legendControl = legend;
}

function updateLeafletMap() {
  const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
  if (!currentVar) return;

  const stats = computeStats(currentVar);
  state.currentStats = stats;

  const breaks = computeQuantileBreaks(stats.sorted, 5);
  state.currentBreaks = breaks;

  // 既存のレイヤーをクリア
  if (state.geoJsonLayer) {
    state.leafletMap.removeLayer(state.geoJsonLayer);
  }

  // GeoJSONレイヤーの描画
  state.geoJsonLayer = L.geoJSON(AOMORI_GEOJSON, {
    style: function(feature) {
      const muniName = feature.properties.name;
      const val = currentVar.data[muniName];
      const fillColor = getColorForValue(val, breaks, state.activePalette);

      return {
        fillColor: fillColor,
        weight: 1.5,
        opacity: 1,
        color: "#ffffff",
        fillOpacity: 0.88
      };
    },
    onEachFeature: function(feature, layer) {
      const muniName = feature.properties.name;
      const val = currentVar.data[muniName];
      const rank = stats.ranks[muniName];

      const rankStr = rank ? `（全40市町村中 第 <strong style="color:#2563eb;">${rank}</strong> 位）` : "";
      const valStr = val !== null && val !== undefined ? `${formatNum(val)} <span style="font-size:0.8rem; font-weight:normal;">${currentVar.unit || ""}</span>` : "データなし";

      // ツールチップ
      layer.bindTooltip(`
        <div class="tooltip-muni-name">${muniName}</div>
        <div class="tooltip-val">${valStr}</div>
        <div class="tooltip-rank">${rankStr}</div>
      `, {
        className: "muni-tooltip",
        sticky: true,
        direction: "top",
        offset: [0, -10]
      });

      // ホバーインタラクション
      layer.on({
        mouseover: function(e) {
          const l = e.target;
          l.setStyle({
            weight: 3,
            color: "#0f172a",
            fillOpacity: 0.95
          });
          if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            l.bringToFront();
          }
        },
        mouseout: function(e) {
          state.geoJsonLayer.resetStyle(e.target);
        }
      });
    }
  }).addTo(state.leafletMap);

  // 初回のみバウンズにフィット
  if (!state.mapFitted) {
    state.leafletMap.fitBounds(state.geoJsonLayer.getBounds(), {
      padding: [20, 20]
    });
    state.mapFitted = true;
  }

  // 凡例の更新
  updateLegendUI(breaks, currentVar.unit);
}

function updateLegendUI(breaks, unit) {
  const legendEl = document.getElementById("leaflet-legend-box");
  if (!legendEl) return;

  const colors = PALETTES[state.activePalette].colors;
  const unitStr = unit ? ` (${unit})` : "";

  let html = `<div class="legend-title">階級凡例${unitStr}</div>`;
  for (let i = 0; i < colors.length; i++) {
    const low = formatNum(breaks[i]);
    const high = formatNum(breaks[i + 1]);
    html += `
      <div class="legend-row">
        <div class="legend-color-box" style="background:${colors[i]};"></div>
        <span>${low} 〜 ${high}</span>
      </div>
    `;
  }
  // 欠損値
  html += `
    <div class="legend-row" style="margin-top:4px; padding-top:4px; border-top:1px dashed #e2e8f0; color:#64748b;">
      <div class="legend-color-box" style="background:#e2e8f0;"></div>
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
  const varListContainer = document.getElementById("variable-list");
  const quickPicksContainer = document.getElementById("quick-picks-container");

  // カテゴリ一覧の抽出・登録
  const categories = ["すべての分野", ...new Set(STATS_DATA.map(d => d.category))];
  catSelect.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join("");

  // クイックピックタグの作成
  quickPicksContainer.innerHTML = QUICK_PICKS.map(p => `
    <button class="quick-tag ${p.id === state.activeVarId ? 'active' : ''}" data-id="${p.id}">
      ${p.label}
    </button>
  `).join("");

  // イベント：クイックピック
  quickPicksContainer.addEventListener("click", e => {
    const btn = e.target.closest(".quick-tag");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    selectVariable(id);
  });

  // イベント：カテゴリ選択
  catSelect.addEventListener("change", () => {
    filterVariables();
  });

  // イベント：検索入力
  searchInput.addEventListener("input", () => {
    filterVariables();
  });

  // イベント：カラーパレット切り替え
  document.querySelectorAll(".palette-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".palette-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activePalette = btn.getAttribute("data-palette");
      updateLeafletMap();
      updateInfoPanels();
    });
  });

  // イベント：A4レポート印刷モーダル表示
  const btnOpenReport = document.getElementById("btn-open-report");
  const modalOverlay = document.getElementById("report-modal");
  const btnCloseReport = document.getElementById("btn-close-report");
  const btnCloseReportFooter = document.getElementById("btn-close-report-footer");

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

  if (btnCloseReportFooter) {
    btnCloseReportFooter.addEventListener("click", () => {
      modalOverlay.classList.add("hidden");
    });
  }

  // イベント：レポート内アクション
  document.getElementById("btn-print-report")?.addEventListener("click", () => {
    window.print();
  });

  document.getElementById("btn-save-report-png")?.addEventListener("click", () => {
    saveReportAsPNG();
  });

  document.getElementById("btn-copy-report-img")?.addEventListener("click", () => {
    copyReportToClipboard();
  });

  // 初期リスト表示
  filterVariables();
  selectVariable(state.activeVarId);
}

// 指標リストのフィルタリング
function filterVariables() {
  const cat = document.getElementById("cat-select").value;
  const kw = document.getElementById("search-input").value.trim().toLowerCase();
  const listContainer = document.getElementById("variable-list");

  state.filteredList = STATS_DATA.filter(item => {
    const matchCat = (cat === "すべての分野" || item.category === cat);
    const matchKw = (!kw || item.name.toLowerCase().includes(kw) || item.fullName.toLowerCase().includes(kw) || item.num.includes(kw));
    return matchCat && matchKw;
  });

  listContainer.innerHTML = state.filteredList.map(item => `
    <div class="variable-item ${item.id === state.activeVarId ? 'selected' : ''}" data-id="${item.id}">
      <div style="display:flex; align-items:center; overflow:hidden;">
        <span class="var-badge">No.${item.num}</span>
        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
      </div>
      <span style="font-size:0.7rem; color:#94a3b8; margin-left:6px; flex-shrink:0;">${item.unit || ''}</span>
    </div>
  `).join("");

  // リスト項目クリックイベント
  listContainer.querySelectorAll(".variable-item").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      selectVariable(id);
    });
  });
}

// 指標の選択と更新
function selectVariable(varId) {
  state.activeVarId = varId;

  // リストの選択ハイライト更新
  document.querySelectorAll(".variable-item").forEach(el => {
    el.classList.toggle("selected", el.getAttribute("data-id") === varId);
  });

  // クイックピックの選択ハイライト更新
  document.querySelectorAll(".quick-tag").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-id") === varId);
  });

  updateLeafletMap();
  updateInfoPanels();
}

// サイドパネルとフローティング統計パネルの更新
function updateInfoPanels() {
  const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
  if (!currentVar) return;

  const stats = state.currentStats || computeStats(currentVar);

  // マップ上部バー
  document.getElementById("active-var-title-text").textContent = currentVar.name;
  document.getElementById("active-var-unit-pill").textContent = currentVar.unit ? `単位: ${currentVar.unit}` : "単位なし";

  // サイドパネルの選択中カード
  document.getElementById("selected-var-num").textContent = `No.${currentVar.num} [${currentVar.category}]`;
  document.getElementById("selected-var-name").textContent = currentVar.name;
  document.getElementById("selected-var-source").textContent = currentVar.source ? `出典: ${currentVar.source}` : "";

  // フローティングサマリーパネル
  document.getElementById("float-stat-mean").textContent = formatNum(stats.mean);
  document.getElementById("float-stat-median").textContent = formatNum(stats.median);
  document.getElementById("float-stat-max-val").textContent = formatNum(stats.max.val);
  document.getElementById("float-stat-max-muni").textContent = `(${stats.max.muni})`;
  document.getElementById("float-stat-min-val").textContent = formatNum(stats.min.val);
  document.getElementById("float-stat-min-muni").textContent = `(${stats.min.muni})`;

  // 上位3自治体
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

  // 下位3自治体
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
   SVG Vector Map Generator (for crisp A4 Report Printing)
   ========================================================================== */
function renderReportSvgMap(varItem, breaks, paletteKey) {
  // 青森県の地理的バウンディングボックス
  const minLon = 139.8601;
  const maxLon = 141.6826;
  const minLat = 40.2178;
  const maxLat = 41.5559;

  const svgW = 540;
  const svgH = 390;
  const pad = 12;

  // メルカトル緯度変換
  function latToY(lat) {
    const latRad = (lat * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  }

  const yMinMerc = latToY(minLat);
  const yMaxMerc = latToY(maxLat);

  // 投影変換関数
  function project(lon, lat) {
    const x = pad + ((lon - minLon) / (maxLon - minLon)) * (svgW - pad * 2);
    const mercY = latToY(lat);
    const y = pad + ((yMaxMerc - mercY) / (yMaxMerc - yMinMerc)) * (svgH - pad * 2);
    return [x, y];
  }

  // 各ポリゴンの描画
  let pathsHtml = "";
  let labelsHtml = "";

  AOMORI_GEOJSON.features.forEach(feat => {
    const muniName = feat.properties.name;
    const val = varItem.data[muniName];
    const fillColor = getColorForValue(val, breaks, paletteKey);

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

    pathsHtml += `<path d="${pathD}" fill="${fillColor}" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round" />`;
  });

  return `
    <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%" style="display:block; background:#ffffff;">
      <g>${pathsHtml}</g>
    </svg>
  `;
}

// レポートモーダルの生成と表示
function openReportModal() {
  const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
  if (!currentVar) return;

  const stats = state.currentStats || computeStats(currentVar);
  const breaks = state.currentBreaks || computeQuantileBreaks(stats.sorted, 5);

  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  // レポートヘッダー
  document.getElementById("rep-target-var-name").textContent = currentVar.name;
  document.getElementById("rep-unit-text").textContent = currentVar.unit ? `（単位: ${currentVar.unit}）` : "";
  document.getElementById("rep-date-text").textContent = `作成日: ${dateStr}`;
  document.getElementById("rep-source-text").textContent = currentVar.source || "令和8年 青森県統計年鑑";

  // SVGベクターマップのレンダリング
  const mapSvgWrapper = document.getElementById("rep-map-render-target");
  mapSvgWrapper.innerHTML = renderReportSvgMap(currentVar, breaks, state.activePalette);

  // レポート凡例
  const colors = PALETTES[state.activePalette].colors;
  let legendItems = "";
  for (let i = 0; i < colors.length; i++) {
    legendItems += `
      <div style="display:flex; align-items:center; gap:4px;">
        <span style="display:inline-block; width:12px; height:9px; background:${colors[i]}; border:1px solid #cbd5e1; border-radius:2px;"></span>
        <span>${formatNum(breaks[i])}〜${formatNum(breaks[i + 1])}</span>
      </div>
    `;
  }
  document.getElementById("rep-legend-items").innerHTML = legendItems;

  // レポート統計表
  document.getElementById("rep-stat-count").textContent = `${stats.count} / 40 市町村`;
  document.getElementById("rep-stat-sum").textContent = formatNum(stats.sum);
  document.getElementById("rep-stat-mean").textContent = formatNum(stats.mean);
  document.getElementById("rep-stat-median").textContent = formatNum(stats.median);
  document.getElementById("rep-stat-max").innerHTML = `<strong>${formatNum(stats.max.val)}</strong> <span style="color:#64748b; font-size:0.68rem;">(${stats.max.muni})</span>`;
  document.getElementById("rep-stat-min").innerHTML = `<strong>${formatNum(stats.min.val)}</strong> <span style="color:#64748b; font-size:0.68rem;">(${stats.min.muni})</span>`;

  // レポート上位5・下位5自治体ランキング
  const top5 = stats.sorted.slice(0, 5);
  document.getElementById("rep-rank-top-list").innerHTML = top5.map((item, idx) => `
    <div class="rep-rank-item">
      <span><strong>${idx + 1}. ${item.muni}</strong></span>
      <span>${formatNum(item.val)}</span>
    </div>
  `).join("");

  const btm5 = stats.sorted.slice(-5).reverse();
  document.getElementById("rep-rank-btm-list").innerHTML = btm5.map(item => `
    <div class="rep-rank-item">
      <span>${stats.ranks[item.muni]}. ${item.muni}</span>
      <span>${formatNum(item.val)}</span>
    </div>
  `).join("");

  // モーダルを表示
  document.getElementById("report-modal").classList.remove("hidden");
}

/* ==========================================================================
   Image Export / Clipboard
   ========================================================================== */
async function saveReportAsPNG() {
  const sheet = document.getElementById("report-sheet");
  if (!sheet) return;

  if (typeof html2canvas !== "function") {
    alert("画像出力ライブラリが読み込まれていません。ブラウザの印刷機能をご利用ください。");
    return;
  }

  try {
    const canvas = await html2canvas(sheet, {
      scale: 2.0, // 高精細
      useCORS: true,
      backgroundColor: "#ffffff"
    });

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    const currentVar = STATS_DATA.find(v => v.id === state.activeVarId);
    const varName = currentVar ? currentVar.name.replace(/[\/\:\*\?\"\<\>\|]/g, "_") : "レポート";
    link.download = `青森県市町村データ100_${varName}_A4レポート.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error("PNG export error:", err);
    alert("画像の保存に失敗しました: " + err.message);
  }
}

async function copyReportToClipboard() {
  const sheet = document.getElementById("report-sheet");
  if (!sheet) return;

  if (typeof html2canvas !== "function") {
    alert("画像出力ライブラリが読み込まれていません。");
    return;
  }

  try {
    const canvas = await html2canvas(sheet, {
      scale: 2.0,
      useCORS: true,
      backgroundColor: "#ffffff"
    });

    canvas.toBlob(async blob => {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new window.ClipboardItem({ "image/png": blob })
        ]);
        alert("レポート画像をクリップボードにコピーしました！資料にそのまま貼り付けできます。");
      } else {
        alert("お使いのブラウザはクリップボードへの画像コピーに対応していません。");
      }
    }, "image/png");
  } catch (err) {
    console.error("Copy image error:", err);
    alert("クリップボードへのコピーに失敗しました: " + err.message);
  }
}

// アプリ起動
window.addEventListener("DOMContentLoaded", () => {
  initLeafletMap();
  initUI();
});
