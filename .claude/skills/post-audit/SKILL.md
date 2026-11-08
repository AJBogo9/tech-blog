---
name: post-audit
description: Use when drafting, revising or auditing the prose, figures and equations of a blog post under site/posts/, when a post reads long or hard to follow, or before a post leaves draft.
---

# Post audit: technical-writing rules

The reader is an industry engineer who follows research, and a student should be
able to follow too. CLAUDE.md sets a post's shape (demo first, then theory). These
rules cover how the prose, figures and equations inside that shape are written.
Each names its source: research (listed at the end) or a ruling of the owner.

## Rules

### Structure

1. **Numbers first, then the general result.** Each theory step opens on the demo's
   own numbers and then states the result in general (concreteness fading, Fyfe
   2014). Check: the first paragraph of each theory subsection uses a demo number.
2. **A figure for every mechanism the main result rests on**, drawn from the post's
   own simulation where possible (Mayer; the owner's research values).
3. **Read time under 10 minutes** on the usual counter: prose words, leaving out
   code, display math and collapsed callouts, divided by 240 (Brysbaert 2019). A
   careful reader adds about 20 s per display equation and a minute per
   interactive figure. Derivations that are not results go into collapsed callouts
   with their numbers kept in the text (equation density, Fawcett 2012; the
   Gibbons reply finds the effect is a correlation).
4. **The summary ends with what to read next**, a short chosen list. Every
   `references.bib` entry is cited in the text or in that list.

### Explanation

5. **Define every term at first use in the running text** (curse of knowledge,
   Pinker 2014, Hinds 1999). The notation table does not count. Usual misses:
   units (nats), field jargon (run length, ess sup, $o(1)$, "first order"), and
   terms left over from a section that was cut.
6. **Teach each idea the main result needs**, on the demo's numbers or in a linked
   post (the owner's aim for the posts; concreteness fading, Fyfe 2014). A
   stopping time or a dual price that the text names and then uses is not taught.
   Check: list those ideas and find where each one is shown.
7. **Each formula gets one sentence in the demo's terms**, for example "with
   $\delta = 1$, an hour adds evidence when the residual is above half a standard
   deviation". Concrete text is understood and remembered better (Sadoski 1993).
8. **Numbers that look inconsistent get connected** where the second one appears
   (a limit that catches the demo's wear in 86 h but needs 276 h for a step).
9. **Every claim has its evidence.** A number comes from the post's code, as a
   cell's output or from a script that prints the numbers the text uses
   (`cusum`'s `_numbers.mjs`). Rerun the code after any change to the model. A
   result cites a source, and a comparison holds by arithmetic. After a cut,
   reread the sentences around it for a claim whose evidence went with the cut
   (the owner's rule: evidence before claims).

### Layout and figures

10. **A figure sits at or before the first sentence that points to it.** No forward
    references across sections (spatial contiguity, Mayer).
11. **Say each thing once** across the text, the captions and a demo's own text.
    Do not retell numbers that a figure or readout shows, unless later text uses
    them (coherence, Mayer).
12. **Name the parts before the demo, and only the parts the demo uses**
    (pre-training and coherence, Mayer).
13. **One demo per post**, the one where the reader can be wrong and find out (the
    owner's ruling; coherence, Mayer). A figure in the theory section may take one
    control when moving it shows a result the text states, as `cusum`'s
    `fig-ville` and `fig-delay` do. Such a figure is not a second demo.

### Sentences

14. **Known information first, new information last.** "This", "such" and "it"
    point to the nearest plausible referent, never back across a figure or demo
    (Gopen & Swan 1990).
15. **Keep the verb close to its subject.** Split appositives and nested clauses
    (Gopen & Swan 1990; Gibson 1998).
16. **Never start a sentence with a symbol** (Knuth et al. 1989).
17. **One name per thing.** A new word reads as a new thing.
18. **Every number carries its unit**, so that one number never stands for two
    quantities.

### Notation and typography

19. **The notation table lists every symbol used more than once, and nothing
    unused.** Use words where a symbol is used once (Halmos 1970).
20. **A non-breaking space joins a number and its unit** (8 mm, 13 %, 3 σ), and
    display equations fit a phone-width column.

## How to audit

1. Read the source and the rendered page: `taliesin preview`, then screenshots in
   the shared Chrome. `taliesin build site --check-only --strict` skips drafts.
2. Count prose words per section and estimate the read time (rule 3).
3. Check every claim (rule 9). Run the post's code, then list each number, cause,
   comparison and result in the text, the captions and the demo's readouts. Mark
   each one SUPPORTED, UNSUPPORTED or WRONG against the code's output, the cited
   source or arithmetic. Wrong and unsupported claims go first in the report.
4. Run `python3 -I ~/.claude/skills/ai-voice-pass/voice_lint.py site/posts/<slug>/index.tmd`.
5. Report findings ranked by how much they help the reader, each with a line link,
   the rule number and a concrete fix. Mark findings that change the post's shape
   (a new figure, a moved section) for the owner to decide.
6. After the fixes: the post's tests, the preview, then the `ai-voice-pass` skill.

## Sources

- Gopen & Swan (1990), "The Science of Scientific Writing", American Scientist.
- Pinker (2014), *The Sense of Style*; Hinds (1999), "The curse of expertise", J.
  Experimental Psychology: Applied.
- Mayer (2020), *Multimedia Learning*, 3rd ed.; effect sizes in Mayer (2017), J.
  Computer Assisted Learning.
- Fyfe, McNeil, Son & Goldstone (2014), "Concreteness fading in mathematics and
  science instruction", Educational Psychology Review.
- Sadoski, Goetz & Fritz (1993), "Impact of concreteness on comprehensibility,
  interest, and recall", J. Educational Psychology.
- Gibson (1998), "Linguistic complexity: locality of syntactic dependencies",
  Cognition.
- Knuth, Larrabee & Roberts (1989), *Mathematical Writing*; Halmos (1970), "How to
  write mathematics".
- Fawcett & Higginson (2012), "Heavy use of equations impedes communication among
  biologists", PNAS, with the reply letters by Gibbons and by Chitnis & Smith.
- Brysbaert (2019), "How many words do we read per minute?", J. Memory and Language.
- Hohman, Conlen, Heer & Chau (2020), "Communicating with interactive articles",
  Distill.
- Smallwood (2011), "Mind-wandering while reading", Language and Linguistics
  Compass.
