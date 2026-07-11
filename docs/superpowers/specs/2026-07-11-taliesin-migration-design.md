# Design: Migrate tech-blog from Quarto to Taliesin

**Date:** 2026-07-11
**Repo:** `AJBogo9/tech-blog` (now private), branch `taliesin-migration`
**Live target:** andreasbogossian.com (Cloudflare Pages, `cf-pages` branch)

## Goal

Replace the Quarto toolchain behind andreasbogossian.com with Taliesin (the
author's own `.tmd` → HTML dev server), in-place in the tech-blog repo, without
publishing anything until the migration is complete and approved. This is
real-world dogfooding of Taliesin against a production personal site.

## Revision (2026-07-11): approach is transplant, not re-author

Investigation found that a **complete, content-current Taliesin port of the blog
already exists** at `taliesin/corpus/tech-blog/`, built as a dogfooding fixture
through the DROP-QUARTO initiative (last updated 2026-07-10). It contains a fully
mapped `_site.yml`, all six OJS posts **already converted to native reactive
`{js}`** (no leftover `{ojs}`, no placeholders), all pages, all projects
(including the three that are only uncommitted WIP on the real blog), citations,
and a Taliesin-built `_site/`. Its CV body and publications include are
byte-identical to the real blog's current WIP, and it is wired into Taliesin's
test suite (`tech_blog.rs`, `cite_bib_fixes.rs`).

Consequently the plan is a **transplant**, not a rewrite:

- Copy the finished `.tmd` site from `corpus/tech-blog/` into the real `tech-blog`
  repo, drop the Quarto files, rewire the deploy, verify, and stage for cutover.
- The two-phase (scaffold → interactivity) execution and the Phase-1 OJS
  placeholder are **obsolete** — interactivity is already done.
- `corpus/tech-blog/` **stays** in the Taliesin repo as a frozen test fixture. The
  real repo receives a one-way copy; the copy source (corpus) is never modified.
  The two are expected to drift; a sync mechanism is an out-of-scope follow-up.

The constraints, goal, and design decisions below still hold; only the execution
plan (see "## Execution plan") is replaced by the transplant flow.

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
  must be rewritten to the native `{js}` reactive model. **Already done** in the
  corpus port — every OJS post is converted; no per-post rewriting remains.
- **CSL fidelity:** Taliesin does IEEE-style formatting, not a full CSL processor.
  Current site already uses IEEE, so expected match — **verify rendering early**.
- **URL parity:** confirm Taliesin's site output produces `/posts/<slug>/` URLs
  matching the current site before mass migration.
- **Python environment:** point `TALIESIN_PYTHON` at a venv with `ipykernel` plus
  the posts' dependencies (numpy, matplotlib, scikit-learn).

## Decisions (from brainstorming)

1. **Approach:** transplant the finished `corpus/tech-blog/` port into the real
   repo (see the Revision note above). The original "scaffold first, then polish
   interactivity" sequencing and the Phase-1 OJS placeholder are superseded —
   interactivity is already converted in the corpus port.
2. **Repo layout:** in-place, on the `taliesin-migration` branch. `.tmd` replaces
   `.qmd`; git history, CNAME, and Cloudflare deploy config are preserved.
3. **Design:** the corpus port already adopts Taliesin's native look plus the
   blog's identity (profile image, favicon, social-icon footer) via a trimmed
   `custom.css`; `theme.scss` is dropped. No further design work planned.
4. **Fixture:** `corpus/tech-blog/` stays in the Taliesin repo as a frozen test
   fixture; the real repo gets a one-way copy. Drift is accepted; sync is an
   out-of-scope follow-up.
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

## Execution plan (transplant)

### What transfers corpus/tech-blog → real tech-blog repo
`.tmd` sources (`index`, `blog`, `projects`, `cv`, `publications`, `404`),
`posts/**` (`.tmd` + `references.bib` + images + helper `.js` + audio),
`projects/**` (`.tmd` + thumbnails + the plan `.md`), `_includes/`, `_site.yml`,
`custom.css` (the corpus version — 351 lines, differs from the real 432-line one),
`ieee.csl`, `bell-curve.svg`, `og-image.webp`, `profile.webp`, `instantpage.js`
(still referenced in `_site.yml body-end`), and the Taliesin-aware `.claude/skills/`.

### What stays in the real repo (not in corpus)
`CNAME`, `robots.txt`, `LICENSE`, `infra/` (Cloudflare terraform — unchanged),
`.git`, `README.md` (stack section updated).

### What is removed from the real repo (Quarto residue)
`_quarto.yml`, `theme.scss`, all `*.qmd`, `posts/**/*.qmd`, `projects/**/*.qmd`,
`.quarto/`, `.quartoignore`, `post-nav.js` (dropped — Taliesin has built-in
prev/next; not referenced in `_site.yml`). The real 432-line `custom.css` is
overwritten by the corpus version.

### What is NOT transplanted from corpus
`theme.scss` (vestigial — referenced by nothing), the built `_site/`
(regenerated), `.claude/settings.local.json` (machine-specific paths),
corpus `_freeze/` is copied only as a local build convenience (gitignored).

### Steps
1. **Reference build.** Confirm the corpus source is clean at HEAD:
   `taliesin check corpus/tech-blog` and `taliesin build corpus/tech-blog`
   (outputs are gitignored; non-destructive). Capture its `_site/` URL set as the
   parity reference.
2. **Transplant** the files above into the real repo on `taliesin-migration`;
   remove the Quarto residue. `taliesin check .` clean.
3. **Build + URL parity.** `taliesin build .` clean; diff the migrated `_site/`
   URL set against the reference. Confirm `/posts/<slug>/`, `/blog.html`, etc.
4. **Browser verify** at mobile (~390×844), laptop landscape (~1440×900), laptop
   portrait (~900×1440): index/blog/a-post/projects/cv/publications/404, plus
   drive the interactive `{js}` controls on one converted post.
5. **Rewire deploy (do NOT run):** `publish.sh` → `taliesin build .` instead of
   `quarto render`; `generate_llms_full.py` glob `index.qmd` → `index.tmd`;
   `.gitignore` de-Quarto'd; `.claude/skills/deploy` rewritten for Taliesin;
   `README.md` stack updated.
6. **Commit** the migration on the branch; stage for author-initiated cutover.

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
- Per-post: the already-converted interactive `{js}` figures behave — drive their
  controls in the browser on at least one heavy post (a-star or fourier-transform).

## Out of scope

- No redesign (identity-preserving port only).
- No new output formats (Taliesin is HTML-only by design).
- No preview/gesture-based editing (source is the only editing surface).
- No deploy during migration; cutover is a separate author-initiated step.
- No open-ended Taliesin feature development (gaps are worked around + flagged).
