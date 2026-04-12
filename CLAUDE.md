# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Preview the site locally:**
```bash
quarto preview
```

**Build the site:**
```bash
quarto render
```

**Render a single post:**
```bash
quarto render posts/<post-slug>/index.qmd
```

Python dependencies are managed via a `.venv` and listed in `requirements.txt`. The Quarto project uses `jupyter: python3`, so the venv's Python kernel is used to execute notebook cells.

## Architecture

This is a [Quarto](https://quarto.org) static website hosted on GitHub Pages (CNAME → `andreasbogossian.com`). The built output goes to `_site/`, which is what gets deployed.

**Key config files:**
- `_quarto.yml` — site-wide config: theme (`darkly`), navbar, footer, math (`katex`), code execution (`freeze: auto`)
- `posts/_metadata.yml` — defaults applied to every post: CC BY license, citation, Google Scholar

**Post format:**
Each post lives in `posts/<slug>/index.qmd`. Frontmatter fields that matter:
- `image:` — filename of the thumbnail shown on the `blog.qmd` listing grid
- `bibliography:` — points to a `.bib` file in the same directory
- `categories:` — drives the filter UI on the blog listing page

Posts are Quarto documents that mix Markdown, Python code cells (executed via Jupyter), and Observable JS (`{ojs}`) cells for interactive visualisations. Python cells use numpy/matplotlib/scikit-learn/torch. Interactive visuals use D3 via OJS cells.

**Execution freeze (`_freeze/`):** With `freeze: auto`, Quarto caches executed cell outputs so re-renders don't re-run Python unless the source changes. The `_freeze/` directory is committed.

**Thumbnails:** Each post's thumbnail is an image file (e.g. `astar.png`, `thumbnail.png`) in the post directory, referenced by the `image:` frontmatter field. There is no automated thumbnail generation — they are manually created screenshots saved into the post directory.
