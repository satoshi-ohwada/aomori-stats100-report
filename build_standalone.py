#!/usr/bin/env python3
"""
Aomori Stats 100 Map & Report - Standalone Single HTML Builder
すべてのCSS、JavaScript、データを1つの単一HTMLに埋め込みます。
"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def read_file(rel_path):
    with open(os.path.join(BASE_DIR, rel_path), "r", encoding="utf-8") as f:
        return f.read()

# Load parts
html = read_file("index.html")
css = read_file("css/style.css")
geojson_js = read_file("js/geojson.js")
data_js = read_file("js/data.js")
app_js = read_file("js/app.js")

# In index.html, replace css link with inline style
import re

css_pattern = r'<link\s+rel="stylesheet"\s+href="css/style\.css(?:\?[^"]*)?">'
html = re.sub(css_pattern, lambda m: f'<style>\n{css}\n</style>', html)

# In index.html, replace app scripts with inline scripts
script_bundle = f"""
  <script>
{geojson_js}
{data_js}
{app_js}
  </script>
"""

script_pattern = r'<!-- App Data & Scripts -->\s*<script src="js/geojson\.js"></script>\s*<script src="js/data\.js"></script>\s*<script src="js/app\.js(?:\?[^"]*)?"></script>'
html = re.sub(script_pattern, lambda m: script_bundle, html)

# Write index_standalone.html
out_path = os.path.join(BASE_DIR, "index_standalone.html")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)

size_kb = os.path.getsize(out_path) / 1024
print(f"Standalone HTML generated successfully: {out_path} ({size_kb:.1f} KB)")
