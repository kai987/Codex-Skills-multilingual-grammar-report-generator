---
name: multilingual-grammar-report-generator
description: Generate or revise validated Chinese, Japanese, English, or mixed-language grammar reports when the user requests grammar analysis of selected text or subtitles. Supports SRT, VTT, ASS, SSA, TXT, and subtitle-package JSON; these file types alone do not trigger analysis. Do not use for merely inspecting or packaging files, subtitle-quality checks, media processing, or learning-site generation.
---

# Multilingual Grammar Report Generator

Analyze only the text or validated primary subtitle selected by the user. Keep
translated reference subtitles separate from original dialogue.

## Resolve this installed skill and its runtime

This folder is a complete, independently installable skill. Resolve its absolute
directory from the `SKILL.md` that was actually loaded; call it `SKILL_DIR` in
the commands below. Never assume the calling project contains this skill or
resolve the launcher from the calling project's `.agents/skills` directory.

Run `node "$SKILL_DIR/scripts/run.mjs"` from the user's working project. The
launcher automatically installs locked runtime dependencies with pinned npm 11
and builds the bundled `runtime/` on first use, then reuses them while current.
It also prepares the pinned Sudachi environment before Host finalization or
OpenAI analysis. Initial dependency/dictionary setup requires network access.
Node.js 24 and Python 3 with `venv` and `pip` must already be available; the
launcher does not install system interpreters or global packages.

Keep the working directory in the user's project. Relative `--input`, `--output`,
and `--host-response` paths refer to that directory, not the installed skill.
Always choose an explicit output directory in the user's project. Store reports
and analysis caches there, not under the installed skill or its `runtime/`.

## Follow the report workflow

1. Validate and parse the selected UTF-8 input.
2. Reconstruct complete sentences while preserving cues, times, speakers,
   context links, languages, confidence, and review state.
   Recognize inline Japanese speaker labels; do not merge separate complete
   replies merely because they lack punctuation, or flag a complete reply
   solely because it is the last cue. Keep dependent clauses connected and
   retain review flags for genuinely unfinished or forced-length groups.
3. Select exactly one provider: `host`, `openai`, or `mock`.
4. Provide exactly one natural example sentence for every identified grammar
   point, with its translation in the selected explanation language.
5. Validate every structured analysis with Zod.
6. Apply deterministic SudachiPy reading enrichment where configured.
7. Validate the final report against
   `runtime/schemas/grammar-report.schema.json` within this skill.
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
   node "$SKILL_DIR/scripts/run.mjs" \
     --input "/path/to/subtitle.srt" \
     --analysis-provider host \
     --prepare-host \
     --output "/path/to/current-project/output/analysis"
   ```

2. Read the emitted `host-analysis-request.json`, its response schema, and
   `references/host-analysis.md`.
3. Analyze the requested sentences directly with the current Host model and
   write only schema-conforming JSON to the emitted
   `host-analysis-response.json`.
4. Finalize deterministically:

   ```bash
   node "$SKILL_DIR/scripts/run.mjs" \
     --analysis-provider host \
     --finalize-host \
     --output "/path/to/current-project/output/analysis"
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
node "$SKILL_DIR/scripts/run.mjs" \
  --input "/path/to/subtitle.srt" \
  --analysis-provider openai \
  --output "/path/to/current-project/output/analysis"
```

Require `OPENAI_API_KEY`; if it is missing, return
`MISSING_OPENAI_API_KEY`. Do not switch to Host or Mock after an OpenAI failure.

## Limit Mock to tests

```bash
node "$SKILL_DIR/scripts/run.mjs" \
  --text "日本語を勉強しています。" \
  --analysis-provider mock \
  --output "/path/to/current-project/output/mock-smoke"
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
