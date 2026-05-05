#!/bin/bash
set -e
python generate_llms_full.py
quarto render
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
