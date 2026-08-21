---
name: deploy
description: Run the blog's deploy ritual: render the site and push site/_site to the cf-pages branch for Cloudflare Pages. Use when the user wants to publish, deploy, or ship the blog live.
---

# Deploy the blog

The site is a Taliesin static build hosted on Cloudflare Pages (CNAME → andreasbogossian.com). Deployment is scripted in `publish.sh`, which renders the site and force-pushes `site/_site/` to the `cf-pages` branch.

## Preflight (do this first)

1. **Confirm intent.** Deploying is outward-facing and force-pushes a branch. Confirm the user wants to publish now unless they already said so explicitly.
2. **Check the working tree** with `git status`. If there are uncommitted source changes, surface them — the user likely wants those committed (with their approval) before the rendered output reflects them.
3. **Recommend a local check** if anything substantive changed: `taliesin preview site` to eyeball rendering before shipping.

## Deploy

Run the existing script from the repo root:

```bash
./publish.sh
```

It runs `taliesin build site`, then inits a throwaway git repo inside `site/_site/`, commits, and force-pushes to the `cf-pages` branch of the same origin remote. Cloudflare Pages builds from that branch.

The rendered sources live in `site/`; everything above it (the deploy script, `requirements.txt`, `_infra/`) is invisible to the build and cannot reach the published output.

## After

- Report the outcome faithfully: if render or push failed, show the error rather than claiming success.
- Cloudflare Pages takes a moment to build; the change is not live the instant the push returns.

## House rules

- Never commit source changes without explicit user approval (the deploy script's commit inside `site/_site/` is separate throwaway state, not your repo history).
