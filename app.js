const INDEX_URL = "./data/component_index_v1.json";

/** @type {null | {version:number, maxDepth:number, components:string[], heads:string[], headIds:string[], naturalIdMin:string, naturalIdMax:string, headStructures:string[], structureOptions:string[], strokeMin:number, strokeMax:number, headStrokeCounts:number[], headOcc:Array<Array<[number, number]>>, directTotalDepth1:number[], directUniqueDepth1:number[]}} */
let INDEX = null;

// componentId -> Map(headId -> countsByDepth[1..maxDepth])
/** @type {null | Array<Map<number, Uint8Array>>} */
let componentToHeads = null;

/** @type {null | (Array<null | BigInt>)} */
let headIdBig = null;

function $(id) {
  return document.getElementById(id);
}

function parseSingleCharInput(el) {
  const s = (el.value || "").trim();
  if (!s) return { ok: false, msg: "请输入内容。" };
  // 允许粘贴多个字符时，默认取第一个（避免用户操作摩擦）。
  const ch = s[0];
  if (!ch) return { ok: false, msg: "输入为空。" };
  return { ok: true, ch };
}

function getLayerRange(modeName, startEl, endEl, maxDepth) {
  const mode = document.querySelector(`input[name="${modeName}"]:checked`)?.value;
  let start = 1;
  let end = maxDepth;
  if (mode === "first") {
    start = 1;
    end = 1;
  } else if (mode === "range") {
    start = Math.max(1, Number(startEl.value || 1));
    end = Math.max(start, Number(endEl.value || maxDepth));
  }
  return { start, end };
}

function parseBigIntInput(inputEl, fallbackStr) {
  const raw = (inputEl.value || "").trim();
  const s = raw || String(fallbackStr || "");
  if (!s) return null;
  // 只保留数字部分
  const m = s.match(/\d+/);
  if (!m) return null;
  return BigInt(m[0]);
}

function parseIntInput(inputEl) {
  if (!inputEl) return null;
  const raw = (inputEl.value || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function isHeadIdInRange(headIdStr, startBigInt, endBigInt) {
  if (!headIdStr) return false;
  return headIdStr >= startBigInt && headIdStr <= endBigInt;
}

function sumRange(counts, start, end) {
  let total = 0;
  for (let d = start; d <= end; d++) total += counts[d];
  return total;
}

function findMinDepthInRange(counts, start, end) {
  for (let d = start; d <= end; d++) {
    if (counts[d] > 0) return d;
  }
  return null;
}

function findMaxDepthInRange(counts, start, end) {
  for (let d = end; d >= start; d--) {
    if (counts[d] > 0) return d;
  }
  return null;
}

function compareBySortPreset(a, b, preset) {
  // 每个结果对象结构：{headId, headChar, countInRange, directUniqueDepth1, directTotalDepth1, minDepth, maxDepth, depthSpan}
  if (preset === "count_desc_directUnique_desc_minDepth_asc") {
    if (b.countInRange !== a.countInRange) return b.countInRange - a.countInRange;
    if (b.directUniqueDepth1 !== a.directUniqueDepth1) return b.directUniqueDepth1 - a.directUniqueDepth1;
    if (a.minDepth !== b.minDepth) return a.minDepth - b.minDepth;
    return b.directTotalDepth1 - a.directTotalDepth1;
  }
  if (preset === "count_desc_directTotal_desc_minDepth_asc") {
    if (b.countInRange !== a.countInRange) return b.countInRange - a.countInRange;
    if (b.directTotalDepth1 !== a.directTotalDepth1) return b.directTotalDepth1 - a.directTotalDepth1;
    if (a.minDepth !== b.minDepth) return a.minDepth - b.minDepth;
    return b.directUniqueDepth1 - a.directUniqueDepth1;
  }
  if (preset === "count_desc_depthSpan_desc_minDepth_asc") {
    if (b.countInRange !== a.countInRange) return b.countInRange - a.countInRange;
    if (b.depthSpan !== a.depthSpan) return b.depthSpan - a.depthSpan;
    if (a.minDepth !== b.minDepth) return a.minDepth - b.minDepth;
    return b.directUniqueDepth1 - a.directUniqueDepth1;
  }
  // 默认回退
  if (b.countInRange !== a.countInRange) return b.countInRange - a.countInRange;
  return a.headChar.localeCompare(b.headChar, "zh-Hans-CN");
}

function renderResults(container, rows) {
  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = `<div class="meta">没有匹配结果。</div>`;
    return;
  }

  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "row";
    const topLine = document.createElement("div");
    topLine.className = "top";

    const ch = document.createElement("div");
    ch.className = "head-char";
    ch.textContent = r.headChar;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `包含次数=${r.countInRange}；第一层总部件数=${r.directUniqueDepth1}（第一层总次数=${r.directTotalDepth1}）；最早层级=${r.minDepth}；最深层级=${r.maxDepth}（跨度=${r.depthSpan}）`;

    topLine.appendChild(ch);
    topLine.appendChild(meta);
    div.appendChild(topLine);
    container.appendChild(div);
  }
}

function buildComponentToHeads() {
  const maxDepth = INDEX.maxDepth;
  const compCount = INDEX.components.length;
  const headsCount = INDEX.heads.length;

  componentToHeads = Array.from({ length: compCount }, () => new Map());

  for (let headId = 0; headId < INDEX.headOcc.length; headId++) {
    const pairs = INDEX.headOcc[headId];
    for (let i = 0; i < pairs.length; i++) {
      const compId = pairs[i][0];
      const depth = pairs[i][1];
      let map = componentToHeads[compId];
      let counts = map.get(headId);
      if (!counts) {
        counts = new Uint8Array(maxDepth + 1);
        map.set(headId, counts);
      }
      if (depth >= 1 && depth <= maxDepth) counts[depth] += 1;
    }
  }
}

function initHandlers() {
  $("btnSearch1").addEventListener("click", () => runQuery1());
  $("btnSearch2").addEventListener("click", () => runQuery2());

  // 任意输入框回车即执行
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const t = e.target;
    if (!t) return;
    const tag = t.tagName ? String(t.tagName).toUpperCase() : "";
    if (tag !== "INPUT" && tag !== "TEXTAREA") return;

    // 根据输入框归属触发查询
    const id = t.id ? String(t.id) : "";
    const query1Ids = new Set([
      "componentInput",
      "layerStart1",
      "layerEnd1",
      "idStart1",
      "idEnd1",
      "strokeMin1",
      "strokeMax1",
      "topN1",
    ]);
    const query2Ids = new Set([
      "headInput",
      "layerStart2",
      "layerEnd2",
      "idStart2",
      "idEnd2",
      "strokeMin2",
      "strokeMax2",
      "topN2",
    ]);

    if (query1Ids.has(id)) {
      e.preventDefault();
      runQuery1();
      return;
    }
    if (query2Ids.has(id)) {
      e.preventDefault();
      runQuery2();
      return;
    }
  });
}

function showStatus(el, msg, isError = false) {
  el.classList.toggle("error", isError);
  el.textContent = msg;
}

function runQuery1() {
  if (!INDEX || !componentToHeads) return;
  const { ok, ch, msg } = (() => {
    const res = parseSingleCharInput($("componentInput"));
    return res.ok ? { ok: true, ch: res.ch } : { ok: false, msg: res.msg };
  })();
  if (!ok) {
    showStatus($("status1"), msg || "输入错误", true);
    return;
  }

  const compId = INDEX.components.indexOf(ch);
  if (compId < 0) {
    showStatus($("status1"), `索引中未找到部件：${ch}`, true);
    $("results1").innerHTML = "";
    return;
  }

  const { start, end } = getLayerRange("layerMode1", $("layerStart1"), $("layerEnd1"), INDEX.maxDepth);
  const startId = parseBigIntInput($("idStart1"), INDEX.naturalIdMin);
  const endId = parseBigIntInput($("idEnd1"), INDEX.naturalIdMax);
  if (startId === null || endId === null) {
    showStatus($("status1"), "请正确填写通用规范字ID区间（自然序号）。", true);
    return;
  }
  const lo = startId <= endId ? startId : endId;
  const hi = startId <= endId ? endId : startId;
  const structureSel = $("structureSelect1")?.value || "";
  let strokeMin = parseIntInput($("strokeMin1"));
  let strokeMax = parseIntInput($("strokeMax1"));
  if (strokeMin === null && INDEX) strokeMin = INDEX.strokeMin ?? 0;
  if (strokeMax === null && INDEX) strokeMax = INDEX.strokeMax ?? 0;
  if (strokeMin > strokeMax) {
    const t = strokeMin;
    strokeMin = strokeMax;
    strokeMax = t;
  }
  const topN = Math.max(1, Number($("topN1").value || 20));
  const preset = $("sort1").value;

  const headsMap = componentToHeads[compId];
  const results = [];
  for (const [headId, counts] of headsMap.entries()) {
    if (!headIdBig || !headIdBig[headId]) continue;
    if (!isHeadIdInRange(headIdBig[headId], lo, hi)) continue;
    if (structureSel && INDEX.headStructures?.[headId] !== structureSel) continue;
    const st = INDEX.headStrokeCounts?.[headId] ?? -1;
    if (st >= 0) {
      if (st < strokeMin || st > strokeMax) continue;
    } else {
      // 缺失值：只有当用户笔画下限大于 0 时才视为不匹配
      if (strokeMin > 0) continue;
    }
    const countInRange = sumRange(counts, start, end);
    if (countInRange <= 0) continue;
    const minDepth = findMinDepthInRange(counts, start, end);
    const maxDepth = findMaxDepthInRange(counts, start, end);
    results.push({
      headId,
      headChar: INDEX.heads[headId],
      countInRange,
      directUniqueDepth1: INDEX.directUniqueDepth1[headId] || 0,
      directTotalDepth1: INDEX.directTotalDepth1[headId] || 0,
      minDepth,
      maxDepth,
      depthSpan: maxDepth - minDepth,
    });
  }

  results.sort((a, b) => compareBySortPreset(a, b, preset));
  const sliced = results.slice(0, topN);
  showStatus($("status1"), `完成：匹配 ${results.length} 个字头，展示前 ${sliced.length} 个。`);
  renderResults($("results1"), sliced);
}

function runQuery2() {
  if (!INDEX || !componentToHeads) return;

  const { ok, ch, msg } = (() => {
    const res = parseSingleCharInput($("headInput"));
    return res.ok ? { ok: true, ch: res.ch } : { ok: false, msg: res.msg };
  })();
  if (!ok) {
    showStatus($("status2"), msg || "输入错误", true);
    return;
  }

  const headId = INDEX.heads.indexOf(ch);
  if (headId < 0) {
    showStatus($("status2"), `索引中未找到字头：${ch}`, true);
    $("results2").innerHTML = "";
    return;
  }

  const { start, end } = getLayerRange("layerMode2", $("layerStart2"), $("layerEnd2"), INDEX.maxDepth);
  const topN = Math.max(1, Number($("topN2").value || 12));

  const startId = parseBigIntInput($("idStart2"), INDEX.naturalIdMin);
  const endId = parseBigIntInput($("idEnd2"), INDEX.naturalIdMax);
  if (startId === null || endId === null) {
    showStatus($("status2"), "请正确填写通用规范字ID区间（自然序号）。", true);
    return;
  }
  const lo = startId <= endId ? startId : endId;
  const hi = startId <= endId ? endId : startId;
  const structureSel = $("structureSelect2")?.value || "";
  let strokeMin = parseIntInput($("strokeMin2"));
  let strokeMax = parseIntInput($("strokeMax2"));
  if (strokeMin === null && INDEX) strokeMin = INDEX.strokeMin ?? 0;
  if (strokeMax === null && INDEX) strokeMax = INDEX.strokeMax ?? 0;
  if (strokeMin > strokeMax) {
    const t = strokeMin;
    strokeMin = strokeMax;
    strokeMax = t;
  }

  // 1) 先统计 queryHead 在 [start,end] 内，每个部件出现多少次（对象键计数）
  const qPairs = INDEX.headOcc[headId];
  const qCompToCount = new Map(); // compId -> countInRange
  for (let i = 0; i < qPairs.length; i++) {
    const compId = qPairs[i][0];
    const depth = qPairs[i][1];
    if (depth < start || depth > end) continue;
    qCompToCount.set(compId, (qCompToCount.get(compId) || 0) + 1);
  }
  if (qCompToCount.size === 0) {
    showStatus($("status2"), `该字头在指定层级范围内没有部件出现（层级 ${start}-${end}）。`, true);
    $("results2").innerHTML = "";
    return;
  }

  // 2) 用倒排索引累加“相同部件交集强度”：对每个部件 c，贡献 min(qCount, candCount)
  const candScore = new Map(); // headId -> score
  const candCountInRange = new Map(); // headId -> totalOcc count in [start,end]（用于次级排序）

  for (const [compId, qCount] of qCompToCount.entries()) {
    const headsMap = componentToHeads[compId];
    if (!headsMap) continue;
    for (const [candHeadId, counts] of headsMap.entries()) {
      if (!headIdBig || !headIdBig[candHeadId]) continue;
      if (!isHeadIdInRange(headIdBig[candHeadId], lo, hi)) continue;
      if (structureSel && INDEX.headStructures?.[candHeadId] !== structureSel) continue;
      const st = INDEX.headStrokeCounts?.[candHeadId] ?? -1;
      if (st >= 0) {
        if (st < strokeMin || st > strokeMax) continue;
      } else {
        if (strokeMin > 0) continue;
      }

      const candCount = sumRange(counts, start, end);
      if (candCount <= 0) continue;
      const prev = candScore.get(candHeadId) || 0;
      candScore.set(candHeadId, prev + Math.min(qCount, candCount));

      // 次级排序：用候选字头在该范围内总出现次数
      candCountInRange.set(candHeadId, (candCountInRange.get(candHeadId) || 0) + candCount);
    }
  }

  const rows = [];
  for (const [candHeadId, score] of candScore.entries()) {
    const headChar = INDEX.heads[candHeadId];
    rows.push({
      candHeadId,
      headChar,
      score,
      totalOcc: candCountInRange.get(candHeadId) || 0,
      directUniqueDepth1: INDEX.directUniqueDepth1[candHeadId] || 0,
    });
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.totalOcc !== a.totalOcc) return b.totalOcc - a.totalOcc;
    return b.directUniqueDepth1 - a.directUniqueDepth1;
  });

  const sliced = rows.slice(0, topN);
  showStatus($("status2"), `完成：匹配 ${rows.length} 个候选字头，展示前 ${sliced.length} 个。`);
  $("results2").innerHTML = "";
  if (!sliced.length) {
    $("results2").innerHTML = `<div class="meta">没有匹配结果。</div>`;
    return;
  }

  for (const r of sliced) {
    const div = document.createElement("div");
    div.className = "row";

    const topLine = document.createElement("div");
    topLine.className = "top";

    const ch = document.createElement("div");
    ch.className = "head-char";
    ch.textContent = r.headChar;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `相同部件强度=${r.score}；该范围总出现次数=${r.totalOcc}；第一层总部件数=${r.directUniqueDepth1}`;

    topLine.appendChild(ch);
    topLine.appendChild(meta);
    div.appendChild(topLine);
    $("results2").appendChild(div);
  }
}

async function main() {
  showStatus($("status1"), "加载索引中...");
  showStatus($("status2"), "加载索引中...");

  // 优先使用 file:// 场景下可用的 window 变量（不需要 fetch）
  if (window && window.COMPONENT_INDEX_V1) {
    INDEX = window.COMPONENT_INDEX_V1;
  } else {
    try {
      const resp = await fetch(INDEX_URL, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      INDEX = await resp.json();
    } catch (e) {
      showStatus($("status1"), `索引加载失败：${String(e)}`, true);
      showStatus($("status2"), `索引加载失败：${String(e)}`, true);
      return;
    }
  }

  headIdBig = (INDEX.headIds || []).map((s) => {
    if (!s) return null;
    try {
      return BigInt(s);
    } catch {
      return null;
    }
  });

  // 填充结构下拉框、笔画数默认区间
  function populateStructureSelect(selectId, options) {
    const sel = $(selectId);
    if (!sel) return;
    const opts = Array.isArray(options) ? options : [];
    sel.innerHTML = `<option value="">不限</option>`;
    for (const opt of opts) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
  }

  populateStructureSelect("structureSelect1", INDEX.structureOptions || []);
  populateStructureSelect("structureSelect2", INDEX.structureOptions || []);

  $("strokeMin1").value = String(INDEX.strokeMin ?? 0);
  $("strokeMax1").value = String(INDEX.strokeMax ?? 24);
  $("strokeMin2").value = String(INDEX.strokeMin ?? 0);
  $("strokeMax2").value = String(INDEX.strokeMax ?? 24);

  // 基于字符数组的 indexOf 在 1834/8704 规模下够用，且只做初始化；生产可改 Map。
  buildComponentToHeads();
  initHandlers();
  showStatus($("status1"), `就绪：最大拆分层级=${INDEX.maxDepth}。`);
  showStatus($("status2"), `就绪：最大拆分层级=${INDEX.maxDepth}。`);

  // 根据 maxDepth 自动修正区间输入默认值
  $("layerEnd1").value = String(INDEX.maxDepth);
  $("layerEnd2").value = String(INDEX.maxDepth);

  // 根据 naturalIdMin/Max 自动填充 ID 范围
  $("idStart1").value = String(INDEX.naturalIdMin || "");
  $("idEnd1").value = String(INDEX.naturalIdMax || "");
  $("idStart2").value = String(INDEX.naturalIdMin || "");
  $("idEnd2").value = String(INDEX.naturalIdMax || "");
}

main();

