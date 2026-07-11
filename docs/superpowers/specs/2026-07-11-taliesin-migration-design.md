# Design: Migrate tech-blog from Quarto to Taliesin

**Date:** 2026-07-11
**Repo:** `AJBogo9/tech-blog` (now private), branch `taliesin-migration`
**Live target:** andreasbogossian.com (Cloudflare Pages, `cf-pages` branch)

## Goal

Replace the Quarto toolchain behind andreasbogossian.com with Taliesin (the
author's own `.tmd` → HTML dev server), in-place in the tech-blog repo, without
publishing anything until the migration is complete and approved. This is
real-world dogfooding of Taliesin against a production personal site.

## Non-negotiable constraints

1. **Privacy.** Nothing new goes public until the author explicitly deploys.
   - Repo is already private.
   - All work stays on the `taliesin-migration` branch; the `cf-pages` deploy
     branch is never touched during migration.
   - Preview is local only (`taliesin preview .`, localhost, never `--host`).
   - `andreasbogossian.com` keeps serving the existing Quarto build until cutover.
2. **Load-bearing content parity.** The corpus of this migration is the current
   live site: every post, project, and page must render correctly, and existing
   URLs (`/posts/<slug>/`, `/blog.html`, etc.) must be preserved so inbound links
   and Open Graph tags survive.
3. **Taliesin discipline.** When the migration surfaces a genuine Taliesin gap or
   bug, the default is: work around it in the blog to keep momentum, and log it as
   a separate upstream follow-up (corpus-pinned fix in the Taliesin repo later).
   Do not fork the migration into open-ended tool development.

## Current state (what we are migrating from)

- **Stack:** Quarto website, `jupyter: python3`, Bootstrap `darkly` theme +
  `theme.scss` (4.7KB) + `custom.css` (10KB), `github-dark` highlighting,
  KaTeX math, IEEE citations via `ieee.csl` + per-post `references.bib`.
- **Pages:** `index` (about: jolla + recent-posts listing), `blog` (grid listing +
  feed + categories), `projects` (listing), `publications` (include),
  `cv` (article + projects listing), `404`.
- **Posts (7):** a-star, em-algorithm, evidence-lower-bound, fourier-transform,
  KL-divergence, Kruskal-Wallis-test, pca-geometry. All use `{python}` cells;
  all but KL-divergence use reactive **`{ojs}`** (Observable JS) for interactive
  visualizations (3–9 cells each, using `viewof`, cross-cell reactive references,
  `html` templates, Plot/d3).
- **Projects (4 committed + 3 uncommitted WIP):** supercollider-mcp (committed);
  activity-challenge-bot, bayesian-aviation-safety, iphone-premium-analysis
  (untracked WIP on `main`). Plus `synthetic-floor-segmentation-plan.md`.
- **Custom JS:** `instantpage.js` (hover prefetch), `post-nav.js` (prev/next).
- **Build/deploy:** `publish.sh` runs `generate_llms_full.py` then `quarto render`
  to `_site/`, then force-pushes `_site/` to the `cf-pages` branch. Cloudflare
  Pages (configured in `infra/`) serves `cf-pages` at the apex domain.
- **Static resources:** `CNAME`, `robots.txt`, `og-image.webp`, `profile.webp`,
  `bell-curve.svg` (favicon), `llms.txt` / `llms-full.txt`.

### Uncommitted WIP to reconcile

`main` has uncommitted edits (`cv.qmd`, `projects.qmd`,
`projects/supercollider-mcp/index.qmd`, `publications.qmd`) and three untracked
project folders. **Open item:** confirm which of these WIP additions are ready to
be part of the migrated site. Default assumption: migrate the current on-disk
content as-is (including WIP), since it reflects the author's latest intent.

## Taliesin capability check (already verified)

| Need | Taliesin support | Notes |
|---|---|---|
| Multi-page site | `preview <dir>` / `build <dir>` → `_site/` | `_site.yml` config |
| Grid listings + categories | Yes (`site/mod.rs`, `categories.rs`) | category-typo linting too |
| RSS/feed | Yes (feed page) | |
| Homepage profile | `about:` block | maps `about: template: jolla` |
| Landing hero | `hero:` block | optional |
| `{python}` cells | Yes (warm Jupyter kernel + `_freeze/`) | needs `ipykernel` in `TALIESIN_PYTHON` |
| Reactive JS | native `{js}` with `//| name:` / `//| viewof:` / `//| input:` | mirrors OJS dataflow; explicit deps |
| KaTeX math | Yes (server-side, offline) | |
| `.bib` citations | Yes, **IEEE numeric** formatting | matches current `ieee.csl` style |
| Cross-refs | Yes (`@fig-`, `@sec-`, cross-page) | |
| Prev/next post nav | Built-in (derives from page order) | replaces `post-nav.js` |
| Hover link-preview / prefetch | Built-in (`link-preview.js`, hover index) | replaces `instantpage.js` |

**Known gaps / risks (accepted):**
- **OJS reactive runtime:** Taliesin has no OJS runtime. Each interactive figure
  must be rewritten to the native `{js}` reactive model. This is the bulk of the
  per-post work and is deferred to Phase 2 (visible placeholder in Phase 1).
- **CSL fidelity:** Taliesin does IEEE-style formatting, not a full CSL processor.
  Current site already uses IEEE, so expected match — **verify rendering early**.
- **URL parity:** confirm Taliesin's site output produces `/posts/<slug>/` URLs
  matching the current site before mass migration.
- **Python environment:** point `TALIESIN_PYTHON` at a venv with `ipykernel` plus
  the posts' dependencies (numpy, matplotlib, scikit-learn).

## Decisions (from brainstorming)

1. **Sequencing:** scaffold the whole site first (structure + all content +
   Python + math + listings + theme identity), then circle back to polish the
   interactive visualizations.
2. **Repo layout:** in-place, on the `taliesin-migration` branch. `.tmd` source
   is added alongside then replaces `.qmd`; git history, CNAME, and Cloudflare
   deploy config are preserved.
3. **Design:** adopt Taliesin's native look (dark default, its typography +
   iron-gall accent) as the baseline; port only identity essentials (profile
   image, favicon, social-icon footer, an accent tweak if wanted). Retire
   `theme.scss` and most of `custom.css`; keep a minimal identity CSS only where a
   real gap appears.
4. **Phase 1 OJS placeholder:** interactive figures render as a small, obviously
   temporary "interactive figure — coming soon" card, replaced by real `{js}` in
   Phase 2.
5. **Gap handling:** work around in the blog, flag upstream (see constraint 3).

## Target structure

```
tech-blog/  (branch: taliesin-migration)
  _site.yml               # was _quarto.yml: title, description, site-url,
                          #   favicon, og image, navbar, footer (social SVGs)
  index.tmd               # about: block + recent-posts listing (max 3)
  blog.tmd                # grid listing + feed + categories
  projects.tmd            # projects listing
  publications.tmd        # page + {{< include _includes/publications.md >}}
  cv.tmd                  # article + projects listing
  404.tmd
  posts/
    _metadata.yml         # csl/author/etc. carried as Taliesin per-dir defaults
    <slug>/index.tmd + images + references.bib
  projects/<slug>/index.tmd + assets
  _includes/publications.md
  <static: CNAME, robots.txt, og-image.webp, profile.webp, bell-curve.svg>
  docs/superpowers/specs/…    # this spec (excluded from the built site)
  publish.sh              # rewritten: taliesin build → cf-pages push
  generate_llms_full.py   # updated to read .tmd
```

Retired: `_quarto.yml`, `theme.scss`, `custom.css` (minus any identity remnant),
`instantpage.js`, `post-nav.js`, `.quarto/`, `.quartoignore`, `_freeze/` (Quarto's).

## Architecture / data flow

Unchanged deploy topology; only the renderer changes:

```
.tmd source ──(taliesin build .)──▶ _site/  ──(publish.sh)──▶ cf-pages branch ──▶ Cloudflare Pages ──▶ andreasbogossian.com
```

`taliesin preview .` serves the same block model locally with hot reload for the
dev loop. The `.tmd` file is the only editing surface; the browser is read-only.

## Execution plan

### Phase 0 — De-risk (before mass migration)
- Point `TALIESIN_PYTHON` at a suitable venv; confirm a `{python}` cell executes.
- Migrate ONE simple post (KL-divergence: Python + math + refs, no OJS) end to end.
- Verify: `taliesin check` clean, `taliesin build` clean, IEEE refs render
  correctly, `/posts/kl-divergence/` URL parity, browser screenshot at 3 viewports.
- This proves the recipe (frontmatter mapping, refs, math, Python, URLs) cheaply.

### Phase 1 — Whole site standing
- Write `_site.yml` (nav, footer, OG, favicon, site-url).
- Migrate every page and post to `.tmd`: prose, `{python}`, math, listings, refs.
- OJS cells → visible placeholder card.
- Port identity CSS (footer social icons, profile, accent) — minimal.
- Wire static resources into the build; ensure `docs/` is excluded from the site.
- Update `generate_llms_full.py` and `publish.sh` (do NOT deploy).
- Verify every page: `check` clean, `build` clean, browser screenshots at mobile
  (~390×844), laptop landscape (~1440×900), laptop portrait (~900×1440).

### Phase 2 — Interactivity
- Convert each post's OJS visualizations to native `{js}` (`//| name:` /
  `//| viewof:` / `//| input:`), one post at a time, browser-verified.
- Order: start with the lightest OJS post, end with the heaviest (a-star: 9 cells,
  fourier-transform: 8 cells).

### Cutover (author-initiated, out of scope for the branch work)
- Author reviews the finished branch, merges to `main`, runs `publish.sh`.
- Confirm the first `cf-pages` deploy from the private repo succeeds and the site
  renders at the apex domain.

## Testing / verification strategy

No in-repo corpus, so verification is:
- `taliesin check <dir>` clean (no frontmatter/category/xref warnings).
- `taliesin build <dir>` clean (no render errors), inspect `_site/`.
- chrome-devtools MCP screenshots per page at the three viewports.
- URL-parity diff: enumerate current `_site/` URLs vs migrated `_site/` URLs.
- Reference-rendering spot check against the current IEEE output.
- Per-post: interactive figures behave (Phase 2) — drive controls in the browser.

## Out of scope

- No redesign (identity-preserving port only).
- No new output formats (Taliesin is HTML-only by design).
- No preview/gesture-based editing (source is the only editing surface).
- No deploy during migration; cutover is a separate author-initiated step.
- No open-ended Taliesin feature development (gaps are worked around + flagged).
