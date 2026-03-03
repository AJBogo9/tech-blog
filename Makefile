# Makefile — common tasks for the tech blog

.PHONY: help preview render new-post update-index

help:
	@echo ""
	@echo "  make preview       — render and serve the blog locally"
	@echo "  make render        — render all posts (no server)"
	@echo "  make update-index  — rebuild index.html post list from frontmatter"
	@echo "  make new-post      — scaffold a new post (prompts for slug)"
	@echo ""

preview:
	quarto preview --port 4444 --no-browser

render:
	quarto render

update-index:
	python3 scripts/update_index.py

new-post:
	@read -p "Post slug (e.g. 2025-03-my-topic): " slug; \
	mkdir -p posts/$$slug; \
	DATE=$$(date +%Y-%m-%d); \
	echo "---\ntitle: \"New Post\"\ndate: $$DATE\ncategories: []\ndescription: \"\"\n---\n\n<a href=\"../../index.html\" class=\"back-link\">← Back to all posts</a>\n\n## Introduction\n\nWrite here.\n" > posts/$$slug/index.qmd; \
	echo "Created posts/$$slug/index.qmd"; \
	echo "Don't forget to run: make update-index"
