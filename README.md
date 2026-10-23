# Multilingual Grammar Report Generator

English | [日本語](README.ja.md)

A Codex skill and Node.js runtime for turning Japanese, Chinese, English, and mixed-language text or subtitles into structured grammar-learning reports. Each identified grammar point includes exactly one original example and its translation.

## Features and scope

- Read UTF-8 TXT, SRT, VTT, ASS, SSA, and validated subtitle-package JSON—not arbitrary JSON.
- Reconstruct sentences while retaining subtitle cue IDs, timestamps, context links, and review flags.
- Explain grammar in context, including contractions, omitted elements, conditionals, and honorific language.
- Enrich Japanese readings with pinned SudachiPy and `sudachidict_core`; leave unresolved substantive out-of-vocabulary readings `null`.
- Validate analysis with Zod and final reports with JSON Schema; export `grammar-report.json` and `grammar-report.md`.
- Cache valid sentence analyses and retry unfinished or invalid sentences.

The repository includes the core runtime, CLI, skill instructions, schemas, reading helper, and relevant tests. Generated reports, user inputs, caches, Python environments, installed dependencies, model weights, and media are not included. Audio transcription, subtitle search, video synchronization checks, and learning-site generation are outside its scope.

## Installation

Requirements: **Node.js 24.x, npm 11.x**, and **Python 3 with `venv` and `pip`**. The package manager is pinned to `npm@11.18.0`; npm 12 is outside the supported range. Initial dependency/dictionary installation needs network access. No local LLM or model-weight download is required.

Run from the cloned repository root:

```bash
git clone https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator.git
cd Codex-Skills-multilingual-grammar-report-generator
node --version
npm --version
npx --yes npm@11.18.0 ci
npm run build
npm run setup:readings
npm test
```

Use `npm ci` directly if npm 11.18.0 is already active. **Build before running the CLI**: workspace packages export their compiled files. Rebuild after changing source code.

`setup:readings` creates `.venv-sudachi` and installs the exact versions in [`scripts/requirements-sudachi.txt`](scripts/requirements-sudachi.txt): SudachiPy 0.6.11 and SudachiDict-core 20260428. Initial installation downloads packages; subsequent reading enrichment runs locally. Set `SUDACHI_PYTHON` only to use an existing environment with those pinned versions. The wrapper checks the reading environment before Host finalization and OpenAI runs.

To use the skill, open this clone in Codex and ask it to follow [`.agents/skills/multilingual-grammar-report-generator/SKILL.md`](.agents/skills/multilingual-grammar-report-generator/SKILL.md) for your selected file. **Do not copy only `SKILL.md` into a global skill directory**: the wrapper resolves runtime dependencies relative to this repository.

## Analysis providers

| Provider | Purpose |
| --- | --- |
| `host` | Interactive default: the current Host model authors analysis through a prepare → analyze → finalize handoff. |
| `openai` | API analysis only when explicitly requested; requires exported `OPENAI_API_KEY`. |
| `mock` | Deterministic fixtures for tests and CI, not real learning reports. |

There is no automatic fallback. An existing API key does not select OpenAI. Host mode is **not** an offline local LLM, and a plain CLI cannot invoke the current Host model. Ollama is not a provider. Sudachi supplies readings, not grammar explanations, translations, or proficiency levels.

### Host: prepare, analyze, finalize

1. Prepare a handoff using a file you are authorized to process:

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --input "/absolute/path/to/subtitle.srt" \
  --analysis-provider host \
  --prepare-host \
  --explanation-language zh-CN \
  --output output/my-report
```

For direct text, replace `--input ...` with `--text "日本語を勉強しています。"`. Explanations and translations support `zh-CN` (default), `ja-JP`, and `en`.

2. Have the current Host read all three resources below, analyze every requested sentence, and save schema-conforming JSON as `output/my-report/host-analysis-response.json`:

- `output/my-report/host-analysis-request.json`
- `output/my-report/host-analysis-schema.json`
- [Host analysis instructions](.agents/skills/multilingual-grammar-report-generator/references/host-analysis.md)

This requires actual analysis by a Host with local file access. Preparation does not author a real analysis response. Preserve sentence IDs, provide one original example and its translation per grammar point, and follow the response schema. Pure-Japanese sentence readings and Japanese vocabulary readings should be `null` for deterministic enrichment.

3. Finalize with **the same output directory**, without passing the original input again:

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --analysis-provider host \
  --finalize-host \
  --output output/my-report
```

Finalization validates the response, enriches readings, and writes both reports. On `HOST_ANALYSIS_VALIDATION_FAILED`, read the rewritten request, have the Host correct only its unfinished IDs, and finalize again. Stop if the manifest reports `retry-exhausted`; do not switch providers.

The wrapper defaults to Host preparation if no phase/provider is supplied. The lower-level CLI requires an explicit Host phase; otherwise it returns `HOST_CONTEXT_REQUIRED`.

### OpenAI: explicit opt-in only

Set `OPENAI_API_KEY` securely in your shell or Host environment before running. Do not commit it or put it in shared commands/reports. [`.env.example`](.env.example) documents variables only: **the CLI does not automatically load `.env` files**.

```bash
# Assumes OPENAI_API_KEY is already securely set in this shell.
export OPENAI_API_KEY
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --input "/absolute/path/to/subtitle.srt" \
  --analysis-provider openai \
  --model "<model-available-to-your-account>" \
  --explanation-language ja-JP \
  --output output/openai-report
```

Replace the placeholder with an accessible model supporting the required Responses API structured output. Model selection is `--model`, then `OPENAI_GRAMMAR_MODEL`, then the implementation default `gpt-5.6-sol`; the default does not guarantee account availability. This mode sends the selected text and context to the API and may incur charges. A missing key fails with `MISSING_OPENAI_API_KEY`.

### Mock smoke test

```bash
npm run grammar-report -- \
  --text "日本語を勉強しています。" \
  --analysis-provider mock \
  --output output/mock-smoke
```

This tests the pipeline without an API or Host handoff. **Mock output is synthetic test data, not a real learning report.** Use a fresh output directory for independent runs.

## Outputs and options

| File | Contents |
| --- | --- |
| `grammar-report.json` | Validated sentences, translations, readings, grammar, vocabulary, examples, and timing |
| `grammar-report.md` | Human-readable report; JSON contains the complete structured data |
| `sentences.json` | Reconstructed sentences and source-cue mapping |
| `input-info.json`, `normalized-text.txt` | Input metadata and normalized text |
| `analysis-manifest.json`, `analysis-cache/` | Progress, retry state, and reusable sentence results |
| `host-analysis-{request,schema,response}.json` | Host handoff files; the Host authors the response |

Subtitle timing is retained; plain-text `start` and `end` values remain `null`. Pure-Japanese sentence readings and Japanese vocabulary readings are enriched in a batch. Mixed-language sentence readings and example readings are not covered by that enrichment. Dictionary/helper versions participate in cache identity to avoid stale readings after upgrades.

```bash
npm run grammar-report -- --help
npm run typecheck
```

Useful options: `--batch-size` (sentences per analysis batch, default 8), `--max-retries` (default 2), `--pause-threshold-seconds` (default 1.2), and `--host-response` for a custom response path. `--overwrite` replaces generated files within the selected output directory; use only when intended. Reuse a task directory for continuation, not unrelated inputs.

## Source layout

```text
.agents/skills/multilingual-grammar-report-generator/  Skill, references, wrapper
apps/cli/                                             Grammar-report CLI
packages/grammar-report-core/                         Analysis and report pipeline
packages/shared/                                      Shared schemas and utilities
packages/subtitle-core/                               Subtitle parsing/reconstruction
schemas/                                              Report and subtitle contracts
scripts/                                              Sudachi helper and requirements
tests/                                                Unit/integration tests and fixture
```

The lockfile pins dependencies. `.gitignore` excludes outputs, caches, environments, credentials, build products, model weights, and media. Ignore rules do not sanitize already tracked files: inspect staged changes before publishing data.

## Troubleshooting and limitations

- **Installation:** confirm Node 24.x and npm 11.x, then retry `npx --yes npm@11.18.0 ci`. Run `npm run build` before CLI usage; do not copy another checkout's `node_modules`.
- **Sudachi:** check `python3`, `venv`, `pip`, and download connectivity. With `SUDACHI_PYTHON`, install the pinned requirements in that environment or unset the override and rerun `npm run setup:readings`.
- **Host validation:** follow the failed-ID request rather than regenerating valid sentences or fabricating placeholders. See the [report contract](.agents/skills/multilingual-grammar-report-generator/references/report-contract.md).
- **API failures:** check explicit provider selection, credentials, and model access. There is no provider fallback.
- **Linguistic accuracy:** schema validation checks structure, not correctness. Short fragments, speaker changes, names, and OOV readings may need human review. Empty grammar arrays may be appropriate for effects/interjections but can also merit review.
- JLPT, HSK, and CEFR labels are learning estimates, not official certifications; uncertain mappings use `unknown` / `unmapped`.

## Feedback and license

Report reproducible problems through [GitHub Issues](https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator/issues), with a minimal authorized text example, provider, and expected behavior. Do not upload credentials, private data, or unauthorized subtitles/media.

[MIT](LICENSE).
