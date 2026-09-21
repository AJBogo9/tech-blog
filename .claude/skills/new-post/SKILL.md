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

5. **Lay down the four section headings** from "Post shape" below, then write the body if the user gave enough to start. Otherwise leave the headings as the stub: an empty post in the right shape is more useful than prose in the wrong one. Mechanics:
   - Math uses KaTeX: inline `$...$`, display `$$...$$`. Reference figures with `@fig-label`.
   - Python cells are ```` ```{python} ```` and execute via Jupyter (`echo: true`, so code shows). Interactive visuals use ```` ```{js} ```` cells with the vendored `Plot`/`d3` globals (or `import()` Three.js); a Python cell can bridge values to `{js}` with `define(name = value)`.
   - Collapsible notation tables use `::: {.callout-note collapse="true"}`. The same callout holds any full derivation.

## Post shape: the demo comes before the theory

The point of a post is to buy applied experience cheaply: build a visual, playable
version of a real problem, get the intuition by pushing on it, and only then go
into the theory. Intuition is the scarce thing. Rigor comes later with experience,
so a post that trades depth of derivation for depth of intuition is trading
correctly.

The order is fixed:

1. **The job.** Two or three sentences naming a real task someone is paid to do.
   Enough to make the demo legible, nothing more.
2. **The interactive demo.** The real problem, visual and playable, *before any
   notation*. The reader forms a guess, pushes on it, and finds out where the
   guess was wrong. This section carries the post.
3. **The theory, sized to the intuition.** Generalise what the reader just moved
   with their own hands.
4. **Summary.**

Rules that make the shape stick:

- **Name section 2 after the concrete problem** ("The pain trial", "Routing a
  delivery van"), never "Example", "Demo" or "Code demo". A generic heading
  re-announces the structure instead of the content.
- **Every equation in section 3 has to be readable as a sentence about the demo**
  ("this term is what spiked when I dragged the slider"). An equation that cannot
  be said that way is decoration. Cut it or cite it.
- **Full derivations go in a collapsed callout.** The rigor stays on the page for
  a later reading, but it does not own the first pass. Proofs are cited, not
  reproduced.
- **A property earns its bullet only if the reader can watch it happen** in the
  demo. "Asymmetric" earns its place if they can swap the two arguments and see
  the number change; otherwise it is trivia.
- **Where the method breaks stays uncollapsed.** Failure modes are intuition, not
  rigor.
- **The notation table goes at the head of section 3**, never at the top of the
  post. Section 2 has to be playable with zero notation, so notation up top
  contradicts the format.
- **Checkable version: section 2 is longer than section 3.** If the theory
  outweighs the demo, the post has drifted back into theory-first.

This constrains topic choice, on purpose. A concept whose behaviour cannot be
shown before it is named is a harder post, and the demo gets simplified until it
carries a cold reader. `Kruskal-Wallis-test` is the closest existing post. The
older `Theory` then `Code demo` posts (`KL-divergence`, `em-algorithm`,
`evidence-lower-bound`) predate this rule and were deliberately left alone.

## House rules (do not violate)

- **No em dashes or en dashes anywhere.** Use commas, colons, parentheses, or restructure.
- There is no `_metadata.yml` cascade in Taliesin. `_site.yml` sets the site-wide `author:`; the CC BY licence, citation and Google Scholar keys the old Quarto `_metadata.yml` declared are not Taliesin features, so do not add them to the post.
- Do not commit. Leave the new files as uncommitted changes for the user to review.
- After scaffolding, remind the user to add `thumbnail.webp`, then run `taliesin preview site` to check rendering and `taliesin build site --check-only --strict` (there is no `taliesin check`) to catch a broken reference before it ships.
