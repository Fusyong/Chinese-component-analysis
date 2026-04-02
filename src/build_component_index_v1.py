"""
把 `Chinese_components_recursive_compact.json` 预处理成前端可快速检索的索引。

索引目标（对应前端两类查询）：
1) 给定“部件”，快速找包含它的“字头”，并能按拆分层级区间统计出现次数。
2) 给定“字头”，计算与其它“字头”在某个层级区间内的“相同部件”交集强度。
"""

# pylint: disable=unused-variable,unused-import
from __future__ import annotations

import json
import csv


INPUT_PATH = "data/Chinese_components_recursive_compact.json"
CSV_INPUT_PATH = "data/Chinese_info_2022-10-14_simplified.csv"
OUTPUT_PATH = "data/component_index_v1.json"
OUTPUT_JS_PATH = "data/component_index_v1.js"


def collect_occurrences(tree: list) -> tuple[list[tuple[str, int]], bool]:
    """
    从一棵“部件递归树”中收集（部件, 拆分层级）的出现。

    口径：
    - 拆分层级从 1 开始：根节点下的“部件键”记为第 1 层。
    - 只统计对象键（{comp: sub_tree}）对应的部件，不统计叶子字符串本身。
    """
    occ: list[tuple[str, int]] = []
    has_obj = False

    stack: list[tuple[object, int]] = [(tree, 0)]  # (node, depth0)
    while stack:
        node, depth0 = stack.pop()
        if not isinstance(node, list):
            continue
        for el in node:
            if isinstance(el, dict):
                has_obj = True
                # 期望：每个 dict 只有一个键
                comp = next(iter(el.keys()))
                sub_tree = el[comp]
                d = depth0 + 1  # 第 1 层从根 dict key 开始
                occ.append((comp, d))
                stack.append((sub_tree, d))

    return occ, has_obj


def main() -> None:
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 读取“字头 -> 属性”映射（用于前端筛选：结构、笔画数、通用规范字ID）
    head_to_natural_id: dict[str, str] = {}
    head_to_structure: dict[str, str] = {}
    head_to_stroke_count: dict[str, int] = {}
    with open(CSV_INPUT_PATH, "r", encoding="utf-8", newline="") as fcsv:
        reader = csv.DictReader(fcsv)
        for row in reader:
            head = (row.get("字头") or "").strip()
            natural_id = (row.get("通用规范字ID") or "").strip()
            structure = (row.get("结构") or "").strip()
            stroke_s = (row.get("笔画数") or "").strip()

            if head and natural_id:
                head_to_natural_id[head] = natural_id
            if head and structure:
                head_to_structure[head] = structure
            if head and stroke_s.isdigit():
                head_to_stroke_count[head] = int(stroke_s)

    heads: list[str] = []
    head_occ_pairs: dict[str, list[tuple[str, int]]] = {}
    component_set: set[str] = set()

    max_depth = 0
    for head, tree in data.items():
        heads.append(head)
        occ, has_obj = collect_occurrences(tree)

        # 若该“字头”本身不可拆（整棵树只有叶子字符串），则把它视为“包含自己”，
        # 让前端在“部件=该字头”时也能命中。
        if not has_obj:
            occ = [(head, 1)]

        for comp, d in occ:
            component_set.add(comp)
            if d > max_depth:
                max_depth = d

        head_occ_pairs[head] = occ

    components: list[str] = sorted(component_set)
    comp_to_id: dict[str, int] = {c: i for i, c in enumerate(components)}

    # headOcc: 按 headId 排列，每项是 [[compId, depth], ...]（用于前端的两类统计）
    head_occ: list[list[list[int]]] = []
    direct_total_depth1: list[int] = []
    direct_unique_depth1: list[int] = []
    head_ids: list[str] = []
    natural_id_min = None
    natural_id_max = None
    head_structures: list[str] = []
    head_strokes: list[int] = []

    structure_set: set[str] = set()
    stroke_min = None
    stroke_max = None

    for head in heads:
        occ_pairs = head_occ_pairs[head]
        pairs = [[comp_to_id[comp], d] for comp, d in occ_pairs]
        head_occ.append(pairs)

        depth1_comps = [comp_to_id[comp] for comp, d in occ_pairs if d == 1]
        direct_total_depth1.append(len(depth1_comps))
        direct_unique_depth1.append(len(set(depth1_comps)))

        nid = head_to_natural_id.get(head, "")
        head_ids.append(nid)
        if nid:
            natural_id_min = nid if natural_id_min is None else min(natural_id_min, nid, key=lambda x: int(x))
            natural_id_max = nid if natural_id_max is None else max(natural_id_max, nid, key=lambda x: int(x))

        st = head_to_structure.get(head, "")
        head_structures.append(st)
        if st:
            structure_set.add(st)

        stroke = head_to_stroke_count.get(head, -1)
        head_strokes.append(stroke)
        if stroke >= 0:
            stroke_min = stroke if stroke_min is None else min(stroke_min, stroke)
            stroke_max = stroke if stroke_max is None else max(stroke_max, stroke)

    out = {
        "version": 1,
        "maxDepth": max_depth,
        "components": components,
        "heads": heads,
        "headIds": head_ids,
        "naturalIdMin": natural_id_min if natural_id_min is not None else "",
        "naturalIdMax": natural_id_max if natural_id_max is not None else "",
        "headStructures": head_structures,
        "structureOptions": sorted(structure_set),
        "strokeMin": stroke_min if stroke_min is not None else 0,
        "strokeMax": stroke_max if stroke_max is not None else 0,
        "headStrokeCounts": head_strokes,
        "headOcc": head_occ,
        "directTotalDepth1": direct_total_depth1,
        "directUniqueDepth1": direct_unique_depth1,
        # 仅供前端展示/调试
        "stats": {
            "heads": len(heads),
            "components": len(components),
            "headOccPairs": sum(len(x) for x in head_occ),
        },
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    # 为了支持“直接双击 index.html（file:// 方式）”运行：
    # 生成一个 JS 文件，把 JSON 作为 window 变量挂载，前端无需 fetch。
    js_obj = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    with open(OUTPUT_JS_PATH, "w", encoding="utf-8") as fjs:
        fjs.write(f"window.COMPONENT_INDEX_V1={js_obj};")

    print(f"已生成：{OUTPUT_PATH}")
    print(f"已生成：{OUTPUT_JS_PATH}")
    print(f"heads={len(heads)} components={len(components)} headOccPairs={sum(len(x) for x in head_occ)} maxDepth={max_depth}")


if __name__ == "__main__":
    main()

