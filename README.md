规范字书写辅助工具，根据部件查字，或根据汉字查找部件相似字，静态页面应用。


## 使用方法

直接双击 `index.html`，用浏览器打开。

## 数据准备

以下命令均在项目根目录下执行（保证 `data/` 相对路径正确）。仅需 Python 3 标准库（`json`、`csv`），无第三方依赖。

1. 准备源表 `data/Chinese_info_2022-10-14_simplified.csv`
2. 生成递归部件树`data/Chinese_components_recursive_compact.json`：
    ```bash
    python script/Chinese_component_hanzi.py
    ```
    输出：   
3. 合并部件树和源表中的一些信息，写出`data/component_index_v1.js`：
    ```bash
    python script/build_component_index_v1.py
    ```
