# Makefile — common tasks for the tech blog
.PHONY: help preview render

help:
	@echo ""
	@echo "  make preview   — render and serve the blog locally"
	@echo "  make render    — render all posts (no server)"
	@echo ""

preview:
	quarto preview --port 4444 --no-browser

render:
	quarto render