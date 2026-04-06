"""递归地分析汉字部件结构
"""

import csv
import json
from collections import Counter


def load_hanzi_data(csv_file):
    """从CSV文件加载汉字数据，返回包含不同类型数据的字典"""
    data = {
        'components': {},  # 部件
        'radical': {},   # 部首
        'strokes': {},    # 笔顺
        'stroke_notes': {} # 笔顺提示
    }

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            char = row['字头']

            # 处理各字段数据
            for field, dict_key in [
                ('部件', 'components'),
                ('部首', 'radical'),
                ('笔顺', 'strokes'),
                ('笔顺提示', 'stroke_notes')
            ]:
                field_str = row[field].strip('"')
                components = [comp.strip() for comp in field_str.split(',') if comp.strip()] if field_str else []
                data[dict_key][char] = components

    return data

def analyze_components(char, hanzi_dict, components_count:Counter) -> tuple[list, Counter]:
    """递归分析汉字部件结构并统计部件个数"""
    if char not in hanzi_dict or not hanzi_dict[char]:
        # 如果字不在字典中或没有部件，返回字本身
        return [char], components_count

    # 递归分析每个部件
    components = hanzi_dict[char]
    result = []
    for comp in components:
        # 统计每个部件的个数
        components_count[comp] += 1
        sub_result, components_count = analyze_components(comp, hanzi_dict, components_count)
        if isinstance(sub_result, str):
            result.append(sub_result)
        else:
            result.append({comp: sub_result})
    return result, components_count

def build_component_tree(char: str, memo: dict, visiting: set, components_map: dict) -> list:
    """
    返回与原 analyze_components 类似的结构：
    - 叶子： [char]
    - 非叶子： [ {comp1: <子树>}, {comp2: <子树>}, ... ]
    """
    if char in memo:
        return memo[char]

    # 环检测：若出现字符在当前递归栈中，直接视为叶子
    if char in visiting:
        return [char]

    visiting.add(char)
    try:
        comps = components_map.get(char, [])
        if not comps:
            res = [char]
        else:
            res = []
            for comp in comps:
                sub_tree = build_component_tree(comp, memo, visiting, components_map)
                res.append({comp: sub_tree})
        memo[char] = res
        return res
    finally:
        visiting.remove(char)
if __name__ == '__main__':
    # CSV 输入（与当前脚本同级）
    csv_path = 'data/Chinese_info_2022-10-14_simplified.csv'
    hanzi_dict = load_hanzi_data(csv_path)
    components_map = hanzi_dict['components']  # dict: 字头 -> 部件列表

    # 结果缓存：加速大量字头的递归拆解
    memo: dict[str, list] = {}

    # 用于检测潜在环（避免递归死循环）
    visiting: set[str] = set()

    # 遍历所有字头并递归分析
    all_chars = list(components_map.keys())
    out = {char: build_component_tree(char, memo, visiting, components_map) for char in all_chars}

    # 输出紧凑 JSON（无缩进、无空格）
    out_path = 'data/Chinese_components_recursive_compact.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))

    print(f'已写出：{out_path}（{len(all_chars)} 个字头）')



