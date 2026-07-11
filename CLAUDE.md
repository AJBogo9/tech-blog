# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Preview the site locally (live reload):**
```bash
taliesin preview .
```

**Build the site to `_site/`:**
```bash
taliesin build .
```

**Check for problems (broken refs, front-matter typos, category drift):**
```bash
taliesin check .
```

**Preview a single post:**
```bash
taliesin preview posts/<post-slug>/index.tmd
```

Python dependencies are managed via a `.venv` and listed in `requirements.txt`.
`{python}` cells execute against a warm Jupyter kernel; point Taliesin at the venv
with `TALIESIN_PYTHON=/path/to/.venv/bin/python` (the venv must have `ipykernel`).

## Architecture

This is a [Taliesin](https://github.com/AJBogo9/taliesin) static website (`.tmd`
sources rendered to HTML) hosted on Cloudflare Pages (CNAME → `andreasbogossian.com`).
The built output goes to `_site/`, which is what gets deployed. Infra is managed with
Terraform in `infra/`. The blog was migrated from Quarto to Taliesin (see
`docs/superpowers/specs/` for the migration design).

**Key config files:**
- `_site.yml` — site-wide config: title, description, `url`, `favicon`, OG `image`,
  `nav`, `footer` (social SVGs), and `head:`/`body-end:` script injection. Flat
  native schema (HTML-only; no `project:`/`website:`/`format:` nesting).
- `posts/_metadata.yml` — defaults applied to every post (CC BY license, citation).
- `custom.css` — site-specific styling on top of Taliesin's theme.

**Post format:**
Each post lives in `posts/<slug>/index.tmd`. Frontmatter fields that matter:
- `image:` / `thumbnail` — the thumbnail shown on the `blog.tmd` listing grid
- `bibliography:` — points to a `.bib` file in the same directory (rendered IEEE-style)
- `categories:` — drives the filter UI on the blog listing page

Posts mix Markdown, `{python}` code cells (executed via Jupyter; numpy/matplotlib/
scikit-learn/torch), math (`$…$`/`$$…$$`, KaTeX server-side), and native reactive
`{js}` cells for interactive visualisations. Reactive `{js}` cells use
`//| name:` / `//| viewof:` / `//| input:` options and the vendored D3 / Observable
Plot libraries. (There is no Observable JS runtime — the OJS `{ojs}` cells were
converted to native `{js}` during the migration.)

**Execution freeze (`_freeze/`):** Taliesin caches executed cell outputs keyed by a
cumulative content hash, so re-renders don't re-run Python unless the cell or an
upstream cell changes. `_freeze/` is gitignored and not committed.

**Thumbnails:** Each post's thumbnail is an image file (e.g. `astar.webp`,
`thumbnail.webp`) in the post directory, referenced by the `image:` frontmatter
field. There is no automated thumbnail generation — they are manually created
screenshots saved into the post directory.

## Deploy

Deployment is scripted in `publish.sh` (regenerate `llms-full.txt`, `taliesin build .`,
then force-push `_site/` to the `cf-pages` branch that Cloudflare Pages serves). See
the `deploy` skill in `.claude/skills/deploy/`. Deploying is outward-facing — confirm
intent first.

## Gotchas

- Editing `custom.css` or a post and not seeing the change: `taliesin preview` hot-reloads,
  but a plain `taliesin build` reuses frozen cell output — a code cell only re-runs when its
  (or an upstream cell's) content changes.
- matplotlib figures use `plt.rcParams.update(...)` inline (not a `plt.style.use` style file);
  a stray/invalid custom style in the venv's matplotlib `stylelib/` can surface as a cell
  `stderr` box in the rendered post, since Taliesin shows cell stderr.
