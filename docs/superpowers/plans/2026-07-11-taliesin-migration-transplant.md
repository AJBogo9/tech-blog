# Taliesin Migration (Transplant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Quarto blog in `AJBogo9/tech-blog` with the finished Taliesin `.tmd` port that already exists at `taliesin/corpus/tech-blog/`, wire the deploy to `taliesin build`, verify, and stage for author-initiated cutover — without publishing.

**Architecture:** One-way file transplant from the corpus fixture into the real repo on branch `taliesin-migration`, followed by build/URL-parity/browser verification and deploy rewiring. The corpus fixture is never modified (it stays load-bearing for Taliesin's tests). The live site and `cf-pages` deploy branch are untouched until the author cuts over.

**Tech Stack:** Taliesin (`taliesin` CLI on PATH), Rust-built static site → `_site/`, Cloudflare Pages via `cf-pages` branch, Python cells via the repo's `.venv` (ipykernel present).

## Global Constraints

- **Privacy:** never touch the `cf-pages` branch; never run `publish.sh`'s push; preview local-only (no `--host`). Repo is already private.
- **Source of truth:** `SRC = /home/bogo/Documents/personal/taliesin/corpus/tech-blog` (read-only — do NOT modify). `DST = /home/bogo/Documents/personal/tech-blog` (branch `taliesin-migration`).
- **Do NOT modify** anything under `taliesin/corpus/` — it is Taliesin's regression fixture.
- **URL parity:** migrated `_site/` must preserve `/posts/<slug>/`, `/projects/<slug>/`, `/blog.html`, `/cv.html`, `/publications.html`, `/projects.html`, `/404.html`.
- **Commits:** allowed on `taliesin-migration` only (never `main`/`cf-pages`). Leave the author's pre-existing uncommitted WIP on `main` alone — it is not part of this branch's commits.
- **Python for cells:** `export TALIESIN_PYTHON=/home/bogo/Documents/personal/tech-blog/.venv/bin/python` (has ipykernel + numpy/matplotlib/scipy/scikit-learn).

---

### Task 1: Reference build of the corpus port

Validate the transplant source is clean at HEAD and capture its URL set as the parity baseline. Non-destructive: `_site/` and `_freeze/` are gitignored in the Taliesin repo.

**Files:**
- Read-only: `taliesin/corpus/tech-blog/**`
- Produce (scratch): `/tmp/claude-1000/-home-bogo-Documents-personal-taliesin/d339c463-5a97-45db-8aec-f104ae6f8528/scratchpad/corpus-urls.txt`

**Interfaces:**
- Produces: `corpus-urls.txt` — the sorted relative URL list later tasks diff against.

- [ ] **Step 1: Confirm the corpus source checks clean**

```bash
cd /home/bogo/Documents/personal/taliesin
export TALIESIN_PYTHON=/home/bogo/Documents/personal/tech-blog/.venv/bin/python
taliesin check corpus/tech-blog
```

Expected: exits 0, no warnings (or only known-benign ones). If it errors, STOP — the source is not clean; investigate before transplanting.

- [ ] **Step 2: Build the corpus port**

```bash
taliesin build corpus/tech-blog
```

Expected: exits 0, writes `corpus/tech-blog/_site/`. No render errors.

- [ ] **Step 3: Capture the reference URL set**

```bash
cd corpus/tech-blog/_site
find . -name '*.html' | sort > /tmp/claude-1000/-home-bogo-Documents-personal-taliesin/d339c463-5a97-45db-8aec-f104ae6f8528/scratchpad/corpus-urls.txt
cat /tmp/claude-1000/-home-bogo-Documents-personal-taliesin/d339c463-5a97-45db-8aec-f104ae6f8528/scratchpad/corpus-urls.txt
```

Expected: lists `./index.html`, `./blog.html`, `./cv.html`, `./projects.html`, `./publications.html`, `./404.html`, `./posts/<slug>/index.html` (×7), `./projects/<slug>/index.html` (×4). Note whether `blog.xml` (RSS) is present — the footer links `/blog.xml`.

- [ ] **Step 4: No commit** (nothing changed in a tracked tree). Proceed.

---

### Task 2: Transplant files and remove Quarto residue

Copy the finished `.tmd` site into `DST`, then delete the Quarto files. End state: `DST` is a valid Taliesin site with no `.qmd`.

**Files:**
- Modify (bulk copy into): `/home/bogo/Documents/personal/tech-blog/`
- Delete: `DST` `*.qmd`, `posts/**/*.qmd`, `projects/**/*.qmd`, `_quarto.yml`, `theme.scss`, `.quartoignore`, `.quarto/`, `post-nav.js`, Quarto `_freeze/`

**Interfaces:**
- Consumes: nothing from Task 1 (Task 1 only validates the source).
- Produces: a transplanted `DST` tree that Task 3 builds.

- [ ] **Step 1: Remove the real repo's Quarto build caches first (gitignored, regenerated)**

```bash
cd /home/bogo/Documents/personal/tech-blog
rm -rf _site _freeze .quarto
```

Expected: no error (dirs may or may not exist).

- [ ] **Step 2: Transplant the corpus port (one-way, excluding fixture-only + machine-specific files)**

```bash
rsync -av \
  --exclude='_site/' \
  --exclude='theme.scss' \
  --exclude='.gitignore' \
  --exclude='.claude/settings.local.json' \
  /home/bogo/Documents/personal/taliesin/corpus/tech-blog/ \
  /home/bogo/Documents/personal/tech-blog/
```

Expected: copies `*.tmd`, `_site.yml`, `custom.css` (corpus 351-line version), `posts/**`, `projects/**`, `_includes/`, `ieee.csl`, favicons/images, `instantpage.js`, `.claude/skills/**`, and `_freeze/` (build convenience). Leaves `DST`'s `.gitignore`, `.claude/settings.local.json`, `CNAME`, `robots.txt`, `LICENSE`, `infra/`, `README.md`, `.venv/` untouched.

- [ ] **Step 3: Delete the Quarto residue**

```bash
cd /home/bogo/Documents/personal/tech-blog
rm -f _quarto.yml theme.scss .quartoignore post-nav.js
rm -f 404.qmd blog.qmd cv.qmd index.qmd projects.qmd publications.qmd
rm -f posts/*/index.qmd projects/*/index.qmd
rm -rf .quarto
```

Expected: no `.qmd` remains. Verify:

```bash
find . -name '*.qmd' -not -path './.venv/*' | head
```

Expected: empty output.

- [ ] **Step 4: Sanity-check the transplanted tree**

```bash
ls _site.yml index.tmd blog.tmd cv.tmd projects.tmd publications.tmd 404.tmd custom.css ieee.csl
wc -l custom.css        # expect 351 (corpus version), not 432
find posts -name 'index.tmd' | wc -l    # expect 7
find projects -name 'index.tmd' | wc -l # expect 4
```

Expected: all files present; `custom.css` is 351 lines; 7 post + 4 project `.tmd`.

- [ ] **Step 5: `taliesin check` the transplanted site**

```bash
export TALIESIN_PYTHON=/home/bogo/Documents/personal/tech-blog/.venv/bin/python
taliesin check .
```

Expected: exits 0, no warnings. If it warns about a category typo / missing xref / stray frontmatter key, fix in the offending `.tmd` (do NOT touch the corpus source), then re-run.

- [ ] **Step 6: Commit the transplant**

```bash
git add -A
git commit -m "feat: transplant Taliesin .tmd site from corpus; drop Quarto"
```

Note: `git add -A` here also stages the author's pre-existing WIP edits to `cv/projects/publications` (now superseded by the transplanted `.tmd`) and removes their `.qmd`. That is intended — the `.tmd` versions are byte-identical in body. Confirm `git status` shows only expected changes before committing.

---

### Task 3: Build and verify URL parity

**Files:**
- Produce: `/home/bogo/Documents/personal/tech-blog/_site/` (gitignored)
- Produce (scratch): `.../scratchpad/dst-urls.txt`

**Interfaces:**
- Consumes: `corpus-urls.txt` from Task 1.

- [ ] **Step 1: Build the migrated site**

```bash
cd /home/bogo/Documents/personal/tech-blog
export TALIESIN_PYTHON=/home/bogo/Documents/personal/tech-blog/.venv/bin/python
taliesin build .
```

Expected: exits 0, writes `_site/`. If Python cells re-run (freeze miss), that is fine as long as it succeeds; if a cell errors for a missing dependency, `pip install` it into `.venv` and rebuild.

- [ ] **Step 2: Diff the URL set against the reference**

```bash
cd _site
find . -name '*.html' | sort > /tmp/claude-1000/-home-bogo-Documents-personal-taliesin/d339c463-5a97-45db-8aec-f104ae6f8528/scratchpad/dst-urls.txt
diff /tmp/claude-1000/-home-bogo-Documents-personal-taliesin/d339c463-5a97-45db-8aec-f104ae6f8528/scratchpad/corpus-urls.txt \
     /tmp/claude-1000/-home-bogo-Documents-personal-taliesin/d339c463-5a97-45db-8aec-f104ae6f8528/scratchpad/dst-urls.txt
```

Expected: no differences (identical page set). Any missing page → investigate the transplant.

- [ ] **Step 3: Confirm the critical URLs and RSS feed exist**

```bash
ls index.html blog.html cv.html projects.html publications.html 404.html
ls posts/a-star/index.html posts/fourier-transform/index.html
ls blog.xml 2>/dev/null && echo "RSS present" || echo "RSS MISSING — footer links /blog.xml"
```

Expected: all HTML present. If `blog.xml` is missing, that is a Taliesin gap: note it as an upstream follow-up (per Global Constraints) and either enable the feed in `blog.tmd` if supported or drop the footer RSS link as a workaround.

- [ ] **Step 4: No commit** (`_site/` is gitignored). Proceed.

---

### Task 4: Browser verification (3 viewports + interactivity)

Drive the live preview with the chrome-devtools MCP. This is the real "does it work" gate.

**Files:** none created.

**Interfaces:** none.

- [ ] **Step 1: Start a local preview**

```bash
cd /home/bogo/Documents/personal/tech-blog
export TALIESIN_PYTHON=/home/bogo/Documents/personal/tech-blog/.venv/bin/python
taliesin preview . 4388 &
```

Expected: serves on `http://localhost:4388` (local only). Wait for "serving" in the log.

- [ ] **Step 2: Screenshot the key pages at three viewports**

Using the chrome-devtools MCP, for each page — `/`, `/blog.html`, `/posts/a-star/index.html`, `/projects.html`, `/cv.html`, `/publications.html`, `/404.html` — resize and screenshot at:
- mobile 390×844
- laptop landscape 1440×900
- laptop portrait 900×1440

Expected: each renders with nav, footer (three social icons), correct theme; the homepage shows the about block + recent-posts listing; `blog` shows the grid + categories; a post shows prose, code, math, and IEEE references.

- [ ] **Step 3: Verify interactivity on a heavy post**

On `/posts/fourier-transform/index.html` (and spot-check `/posts/a-star/index.html`): drive the reactive `{js}` controls (sliders/inputs) and confirm the figures update. Check the console has no errors.

```
(chrome-devtools MCP) list_console_messages  → expect no errors
```

Expected: controls respond, figures re-render, zero console errors. If a figure is broken, capture the console error; fix in the post's `.tmd` (never the corpus source) and reload.

- [ ] **Step 4: Stop the preview**

```bash
# find and kill only THIS preview (do not pkill broadly — it can kill the shell)
jobs -l    # note the PID of the backgrounded taliesin preview
kill <that PID>
```

Expected: preview stops.

- [ ] **Step 5: No commit** (verification only). Record findings; if any `.tmd` was fixed, commit it: `git commit -am "fix: <page> rendering after transplant"`.

---

### Task 5: Rewire the deploy (do NOT run it)

Point the deploy machinery at Taliesin. Nothing is pushed.

**Files:**
- Modify: `/home/bogo/Documents/personal/tech-blog/publish.sh`
- Modify: `/home/bogo/Documents/personal/tech-blog/generate_llms_full.py:25`
- Modify: `/home/bogo/Documents/personal/tech-blog/.gitignore`
- Modify: `/home/bogo/Documents/personal/tech-blog/.claude/skills/deploy/SKILL.md`
- Modify: `/home/bogo/Documents/personal/tech-blog/README.md`

**Interfaces:** none.

- [ ] **Step 1: Rewrite `publish.sh` to build with Taliesin**

Replace the `quarto render` line. New `publish.sh`:

```bash
#!/bin/bash
set -e
python generate_llms_full.py
taliesin build .
cd _site
rm -rf .venv
git init
git remote add origin $(git -C .. remote get-url origin)
git checkout -b cf-pages
git add -A
git commit -m "deploy $(date)"
git push -f origin cf-pages
cd ..
rm -rf _site/.git
```

(Only the render command changed: `quarto render` → `taliesin build .`. The `cf-pages` force-push mechanism is unchanged.)

- [ ] **Step 2: Update the llms generator glob to `.tmd`**

In `generate_llms_full.py`, change line 25:

```python
    for post in sorted(POSTS_DIR.glob("*/index.tmd"), key=lambda p: p.parent.name):
```

(The `{ojs}` strip on line 16 is now a harmless no-op — leave it, or change `ojs` to `js` if you want to strip reactive cells from the llms text.)

- [ ] **Step 3: Verify the llms generator runs against `.tmd`**

```bash
cd /home/bogo/Documents/personal/tech-blog
python generate_llms_full.py
head -5 llms.txt && wc -l llms-full.txt
```

Expected: regenerates `llms.txt` / `llms-full.txt` with all 7 posts (non-empty). These are gitignored.

- [ ] **Step 4: De-Quarto the `.gitignore`**

Replace Quarto-specific entries. Keep `_site/`, `_freeze/`, `.venv/`, `_notes/`, `infra/` state, editor entries. Remove `.quarto/`, `*.quarto_ipynb*`, `**/*.quarto_ipynb`. Add a comment noting it's a Taliesin build now.

- [ ] **Step 5: Rewrite the deploy skill for Taliesin**

In `.claude/skills/deploy/SKILL.md`, replace Quarto references: "Quarto static build" → "Taliesin static build"; `quarto render` → `taliesin build .`; `quarto preview` → `taliesin preview .`. Keep the preflight/confirm-intent and force-push warnings.

- [ ] **Step 6: Update `README.md` stack**

Change the Stack line from Quarto/OJS to Taliesin, and the local-dev commands from `quarto preview`/`quarto render` to `taliesin preview .`/`taliesin build .`.

- [ ] **Step 7: Commit the deploy rewiring**

```bash
git add publish.sh generate_llms_full.py .gitignore .claude/skills/deploy/SKILL.md README.md
git commit -m "chore: rewire deploy + llms + docs for Taliesin (no deploy run)"
```

---

### Task 6: Finalize the branch and stage for cutover

**Files:** none.

- [ ] **Step 1: Confirm a clean, deploy-ready branch**

```bash
cd /home/bogo/Documents/personal/tech-blog
git status
git log --oneline -6
find . -name '*.qmd' -not -path './.venv/*'   # expect empty
```

Expected: working tree clean (or only gitignored artifacts), the migration commits present, no `.qmd`.

- [ ] **Step 2: Write the cutover checklist for the author**

Summarize (do NOT execute): review the branch → merge `taliesin-migration` into `main` → run `./publish.sh` → confirm the first `cf-pages` deploy from the now-private repo succeeds (Cloudflare's GitHub app retains private-repo access) → verify `andreasbogossian.com` renders → decide if/when to make the repo public again.

- [ ] **Step 3: Report** the outcome faithfully (what built clean, what was browser-verified, any flagged Taliesin gap like a missing RSS feed). Do not claim the site is live — it is not until the author cuts over.

---

## Self-review notes

- **Spec coverage:** transplant file-set (Task 2) ↔ spec "What transfers/stays/removed"; URL parity (Tasks 1+3) ↔ constraint 2; browser + interactivity (Task 4) ↔ verification strategy; deploy rewire without running (Task 5) ↔ privacy constraint + out-of-scope cutover; frozen-fixture (Global Constraints "do NOT modify corpus") ↔ decision 4.
- **No placeholders:** every step has an exact command + expected output.
- **Known open item — RSS `/blog.xml`:** flagged in Task 3 Step 3 as verify-and-maybe-workaround, consistent with the gap-handling constraint.
