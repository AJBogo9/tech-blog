---
name: new-post
description: Scaffold a new blog post under site/posts/<slug>/ with correct Taliesin frontmatter, a references.bib, and this blog's house conventions. Use when the user wants to start writing a new blog post, add an article, or create a new entry under posts/.
---

# Scaffold a new blog post

Create a new post in this Taliesin blog following the established conventions.

Rendered sources live under `site/`, so a post is `site/posts/<slug>/index.tmd`.

## Steps

1. **Determine the slug.** Derive a short kebab-case slug from the topic (e.g. "The Fourier Transform" -> `fourier-transform`). Confirm it with the user if ambiguous.

2. **Create `site/posts/<slug>/index.tmd`.** There is no `taliesin new` subcommand (the CLI is `init`, `preview`, `build`, `doctor`, `lsp`), so write the front matter by hand and copy the shape from an existing post rather than from memory. Taliesin's flat schema has no `format:` block; a misspelled key is an error, not a warning.

3. **The front matter** is:

   ```
   image: "thumbnail.webp"
   image-alt: "<Descriptive alt text for the thumbnail>"
   bibliography: references.bib
   ```

   - **Reuse existing categories.** The current post pool is `Algorithms`, `Machine Learning`, `Mathematics`, `Statistics` (Title Case, deliberately broad). Only invent a new category if nothing fits. Categories feed the RSS feed and card badges; there is no category filter UI, and nothing lints a plausible-looking new one, so keep the pool tight by hand.
   - `image` is almost always `thumbnail.webp` (one post uses a named file). The thumbnail itself is created manually later, so do not generate it. Leave a note reminding the user to add it.

4. **Create an empty `site/posts/<slug>/references.bib`** (BibTeX). IEEE is Taliesin's built-in style; there is no `csl:` key. Add entries as the post cites sources, and cite with `[@key]` (a bare `@key` renders as literal text).

5. **Write the body** if the user gave enough to start; otherwise leave the stub the command wrote. Match the house style of existing posts:
   - Open with a concrete, motivating example or question, not a definition.
   - Math uses KaTeX: inline `$...$`, display `$$...$$`. Reference figures with `@fig-label`.
   - Python cells are ```` ```{python} ```` and execute via Jupyter (`echo: true`, so code shows). Interactive visuals use ```` ```{js} ```` cells with the vendored `Plot`/`d3` globals (or `import()` Three.js); a Python cell can bridge values to `{js}` with `define(name = value)`.
   - Collapsible notation tables use `::: {.callout-note collapse="true"}`.

## House rules (do not violate)

- **No em dashes or en dashes anywhere.** Use commas, colons, parentheses, or restructure.
- There is no `_metadata.yml` cascade in Taliesin. `_site.yml` sets the site-wide `author:`; the CC BY licence, citation and Google Scholar keys the old Quarto `_metadata.yml` declared are not Taliesin features, so do not add them to the post.
- Do not commit. Leave the new files as uncommitted changes for the user to review.
- After scaffolding, remind the user to add `thumbnail.webp`, then run `taliesin preview site` to check rendering and `taliesin build site --check-only --strict` (there is no `taliesin check`) to catch a broken reference before it ships.
