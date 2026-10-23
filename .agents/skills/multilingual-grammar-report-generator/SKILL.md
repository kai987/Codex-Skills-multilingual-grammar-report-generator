---
name: multilingual-grammar-report-generator
description: Generate or revise validated Chinese, Japanese, English, or mixed-language grammar reports when the user requests grammar analysis of selected text or subtitles. Supports SRT, VTT, ASS, SSA, TXT, and subtitle-package JSON; these file types alone do not trigger analysis. Do not use for merely inspecting or packaging files, subtitle-quality checks, media processing, or learning-site generation.
---

# Multilingual Grammar Report Generator

Analyze only the text or validated primary subtitle selected by the user. Keep
translated reference subtitles separate from original dialogue.

## Follow the report workflow

1. Validate and parse the selected UTF-8 input.
2. Reconstruct complete sentences while preserving cues, times, speakers,
   context links, languages, confidence, and review state.
3. Select exactly one provider: `host`, `openai`, or `mock`.
4. Provide exactly one natural example sentence for every identified grammar
   point, with its translation in the selected explanation language.
5. Validate every structured analysis with Zod.
6. Apply deterministic SudachiPy reading enrichment where configured.
7. Validate the final report against
   `schemas/grammar-report.schema.json`.
8. Write `grammar-report.json` atomically, then render
   `grammar-report.md`.

Read [references/report-contract.md](references/report-contract.md) when
validating output, diagnosing empty grammar arrays, or extending an adapter.
Read [references/host-analysis.md](references/host-analysis.md) whenever
performing Host analysis.

## Choose the analyzer

Use `host` by default for interactive Codex or ChatGPT Work requests.

`host` means the current Host model analyzes the prepared sentences directly.
Do not call the OpenAI API, Ollama, another Codex process, or ChatGPT UI
automation to simulate Host analysis. Do not claim a specific Host model unless
the Host exposes it reliably; otherwise record `current-host-model`.

Use `openai` only when the user explicitly requests the OpenAI API. An existing
`OPENAI_API_KEY` is not permission to select it. Use `mock` only for automated
tests, CI, fixtures, and offline evaluation. Never use Mock for a real
user-facing report. Never fall back automatically between providers.

## Run the Host workflow

For interactive Host analysis:

1. Prepare the handoff:

   ```bash
   node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
     --input "/path/to/subtitle.srt" \
     --analysis-provider host \
     --prepare-host
   ```

2. Read the emitted `host-analysis-request.json`, its response schema, and
   `references/host-analysis.md`.
3. Analyze the requested sentences directly with the current Host model and
   write only schema-conforming JSON to the emitted
   `host-analysis-response.json`.
4. Finalize deterministically:

   ```bash
   node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
     --analysis-provider host \
     --finalize-host \
     --output "/path/to/analysis"
   ```

5. If finalization returns `HOST_ANALYSIS_VALIDATION_FAILED`, repeat steps 2–4
   with the rewritten request, which contains only failed sentences. Stop when
   the manifest reports `retry-exhausted`; do not switch providers.

The wrapper defaults to Host preparation when no provider is supplied. A plain
Node CLI cannot access the current Host model; `--analysis-provider host`
without a prepare/finalize phase must return `HOST_CONTEXT_REQUIRED`.

Direct text uses `--text` during preparation. Do not pass the original input
again during finalization.

## Run OpenAI only after explicit permission

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --input "/path/to/subtitle.srt" \
  --analysis-provider openai
```

Require `OPENAI_API_KEY`; if it is missing, return
`MISSING_OPENAI_API_KEY`. Do not switch to Host or Mock after an OpenAI failure.

## Limit Mock to tests

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --input "tests/fixtures/sample-ja.srt" \
  --analysis-provider mock
```

Mock is deterministic test data, not real grammar analysis.

## Preserve deterministic enrichment and recovery

SudachiPy is a reading enricher, not an analysis provider. After Host or OpenAI
output passes Zod validation, replace pure-Japanese sentence readings and
Japanese vocabulary readings in one batch. Leave unresolved substantive OOV
readings `null`. Include dictionary and enrichment versions in the cache
configuration hash.

Cache valid sentences independently using text, language, adjacent context,
provider, model configuration, explanation language, schema/prompt versions,
and deterministic enrichment configuration. Retry only missing or failed
sentence IDs. Never change the `grammar-report.json` contract expected by
`multilingual-grammar-learning-site-builder`.
