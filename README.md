# Multilingual Grammar Report Generator

A standalone Codex skill and TypeScript runtime for analyzing Chinese,
Japanese, English, and mixed-language text or subtitle files. It reconstructs
sentences, produces structured grammar explanations, adds one example sentence
per grammar point, enriches Japanese readings with SudachiPy, and writes
validated JSON and Markdown reports.

## Included

- Codex skill instructions and Host handoff wrapper
- Host, OpenAI, and deterministic test adapters
- SRT, VTT, ASS, SSA, TXT, direct-text, and subtitle-package input support
- Sentence-level caching and targeted Host retry support
- SudachiPy + `sudachidict_core` Japanese reading enrichment
- Zod and JSON Schema validation
- `grammar-report.json` and `grammar-report.md` rendering

Generated reports, caches, virtual environments, benchmark data, videos, and
other project output are intentionally excluded from this repository.

## Requirements

- Node.js 24
- npm 11 or newer
- Python 3 for Japanese reading enrichment

## Install

```bash
npm ci
npm run build
```

The first OpenAI run or Host finalization creates `.venv-sudachi` and installs
the pinned versions from `scripts/requirements-sudachi.txt`.

## Host workflow (default)

Prepare the sentences and response contract:

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --input "/path/to/article.txt" \
  --analysis-provider host \
  --prepare-host \
  --output "/path/to/report"
```

The current Codex/ChatGPT Work Host writes the schema-conforming response to
`/path/to/report/host-analysis-response.json`. Finalize it with:

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --analysis-provider host \
  --finalize-host \
  --output "/path/to/report"
```

Host mode never calls OpenAI, Ollama, a nested Codex process, or UI automation.

## OpenAI API workflow

Use this only after explicitly choosing the OpenAI API:

```bash
export OPENAI_API_KEY="..."
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --input "/path/to/article.txt" \
  --analysis-provider openai \
  --output "/path/to/report"
```

## Direct text

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --text "この方法なら、うまくいくはずです。" \
  --analysis-provider host \
  --prepare-host \
  --output "/path/to/report"
```

## Repository layout

```text
.agents/skills/multilingual-grammar-report-generator/  Codex skill
apps/cli/                                              grammar-report CLI
packages/grammar-report-core/                          analysis workflow
packages/subtitle-core/                                subtitle parsing
packages/shared/                                       schemas and utilities
schemas/grammar-report.schema.json                     output contract
scripts/sudachi-readings.py                            reading helper
```

## License

MIT
