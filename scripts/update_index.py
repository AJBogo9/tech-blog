#!/usr/bin/env python3
"""
update_index.py

Scans all posts in the posts/ directory and updates the posts array
in index.html automatically. Run this after adding new posts.

Usage:
    python3 scripts/update_index.py
"""

import re
import sys
from pathlib import Path
from datetime import datetime

try:
    import yaml
except ImportError:
    print("PyYAML not found. Install with: pip install pyyaml")
    sys.exit(1)


def parse_frontmatter(qmd_path: Path) -> dict | None:
    """Extract YAML frontmatter from a .qmd file."""
    text = qmd_path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return None
    try:
        return yaml.safe_load(match.group(1))
    except yaml.YAMLError as e:
        print(f"  WARNING: Could not parse {qmd_path}: {e}")
        return None


def build_post_entry(qmd_path: Path, posts_root: Path) -> str | None:
    """Build a JS object literal for a single post."""
    fm = parse_frontmatter(qmd_path)
    if not fm:
        return None

    title = fm.get("title", "Untitled")
    description = fm.get("description", "")
    date_raw = fm.get("date", "")
    tags = fm.get("categories", [])

    # Normalise date to YYYY-MM-DD string
    if isinstance(date_raw, datetime):
        date_str = date_raw.strftime("%Y-%m-%d")
    else:
        date_str = str(date_raw)

    # URL relative from site root: posts/<folder>/index.html
    rel = qmd_path.parent.relative_to(posts_root.parent)
    url = str(rel / "index.html").replace("\\", "/")

    tags_js = ", ".join(f'"{t}"' for t in tags)

    return (
        "    {\n"
        f'      title: "{title}",\n'
        f'      description: "{description}",\n'
        f'      date: "{date_str}",\n'
        f'      tags: [{tags_js}],\n'
        f'      url: "{url}"\n'
        "    }"
    )


def main():
    root = Path(__file__).parent.parent
    posts_dir = root / "posts"
    index_path = root / "index.html"

    if not posts_dir.exists():
        print(f"No posts/ directory found at {posts_dir}")
        sys.exit(1)

    qmd_files = sorted(posts_dir.glob("*/index.qmd"), reverse=True)
    print(f"Found {len(qmd_files)} post(s).")

    entries = []
    for qmd in qmd_files:
        entry = build_post_entry(qmd, posts_dir)
        if entry:
            entries.append(entry)
            print(f"  + {qmd.parent.name}")

    new_posts_js = "  const posts = [\n" + ",\n".join(entries) + "\n  ];"

    index_html = index_path.read_text(encoding="utf-8")
    updated = re.sub(
        r"  const posts = \[.*?\];",
        new_posts_js,
        index_html,
        flags=re.DOTALL,
    )

    if updated == index_html:
        print("WARNING: Could not find posts array in index.html — no changes made.")
        sys.exit(1)

    index_path.write_text(updated, encoding="utf-8")
    print(f"index.html updated with {len(entries)} post(s).")


if __name__ == "__main__":
    main()
