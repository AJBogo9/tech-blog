#!/bin/bash
set -e
quarto render
cd _site
git init
git remote add origin $(git -C .. remote get-url origin)
git checkout -b cf-pages
git add -A
git commit -m "deploy $(date)"
git push -f origin cf-pages
cd ..
