# Tech Blog

A personal technical blog built with [Quarto](https://quarto.org) for posts and a hand-crafted HTML/CSS/JS landing page.

## Structure

```
tech-blog/
├── _quarto.yml              # Quarto project config (themes, format)
├── custom-light.scss        # Light theme overrides
├── custom-dark.scss         # Dark theme overrides
├── index.html               # Landing page (search, tags, post list)
├── Makefile                 # Convenience commands
├── scripts/
│   └── update_index.py      # Regenerates post list in index.html
└── posts/
    └── YYYY-MM-<slug>/
        └── index.qmd        # One directory per post
```

## Prerequisites

- [Quarto CLI](https://quarto.org/docs/get-started/) ≥ 1.4
- Python 3 + PyYAML (`pip install pyyaml`) — only needed for `update_index.py`

## Workflow

### Preview locally

```bash
make preview
# or: quarto preview --port 4444
```

This renders and serves the site at `http://localhost:4444`. The landing page
(`index.html`) is served as-is alongside the rendered Quarto output in `_site/`.

### Add a new post

**Option A — make:**
```bash
make new-post
# enter a slug like: 2025-03-understanding-memory-allocators
```

**Option B — manual:**
1. Create `posts/YYYY-MM-<slug>/index.qmd`
2. Add YAML frontmatter (see template below)
3. Write your post

**Frontmatter template:**
```yaml
---
title: "Your Post Title"
date: 2025-03-01
categories: [tag1, tag2]
description: "One sentence summary shown in the post list."
---
```

### Update the landing page

After adding posts, regenerate the post list in `index.html`:

```bash
make update-index
# or: python3 scripts/update_index.py
```

This parses the frontmatter of every `posts/*/index.qmd` and rewrites the
`const posts = [...]` array in `index.html`.

### Render for deployment

```bash
make render
# or: quarto render
```

Output goes to `_site/`. Copy `index.html` into `_site/` before deploying:

```bash
cp index.html _site/index.html
```

## Light / Dark theme

- The landing page (`index.html`) respects `prefers-color-scheme` on first load
  and saves the user's manual preference to `localStorage`.
- Quarto post pages use Quarto's built-in light/dark toggle (flatly / darkly themes).
- Custom typography and styling overrides live in `custom-light.scss` and
  `custom-dark.scss`.

## Customisation tips

| What to change | Where |
|---|---|
| Blog name / tagline | `index.html` header section + `_quarto.yml` title |
| Fonts | `@import` URLs in both `.scss` files + `index.html` |
| Accent colour | `--accent` CSS variable in `index.html` |
| Post page layout | `custom-light.scss` / `custom-dark.scss` |
| Code highlight style | `highlight-style` in `_quarto.yml` |
