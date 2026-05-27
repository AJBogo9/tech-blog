# Andreas Bogossian: Tech Blog

[![CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](LICENSE)

Personal tech blog at [andreasbogossian.com](https://andreasbogossian.com). Posts cover machine learning, algorithms, and software engineering, with interactive visualisations built in Observable JS.

**Stack:** [Quarto](https://quarto.org), Python (numpy, matplotlib, scikit-learn), D3 via OJS

## Local development

```bash
# Install Python deps
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# Preview with live reload
quarto preview

# Full build
quarto render
```
