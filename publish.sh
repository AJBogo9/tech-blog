#!/bin/bash
set -e
python generate_llms_full.py
taliesin build .
cd _site
# taliesin build mirrors every non-dot/underscore file into _site (unlike Quarto's
# resources: allowlist), so strip deploy internals before publishing. IaC secrets
# live under _infra/ (underscore = never mirrored); the infra/_infra removals here
# are belt-and-suspenders so a stray copy can never reach the public cf-pages branch.
rm -rf infra _infra publish.sh generate_llms_full.py requirements.txt .venv
git init
git remote add origin $(git -C .. remote get-url origin)
git checkout -b cf-pages
git add -A
git commit -m "deploy $(date)"
git push -f origin cf-pages
cd ..
rm -rf _site/.git
