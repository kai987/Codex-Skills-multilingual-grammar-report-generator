# Multilingual Grammar Report Generator

English | [日本語](README.ja.md)

A self-contained Codex skill for turning Japanese, Chinese, English, and mixed-language text or subtitles into structured grammar-learning reports. Each identified grammar point includes exactly one original example and its translation.

## Install in Codex

Ask Codex to use the built-in installer:

```text
$skill-installer

Install the skill from kai987/Codex-Skills-multilingual-grammar-report-generator,
path .agents/skills/multilingual-grammar-report-generator, ref main.
```

The complete [installable folder](.agents/skills/multilingual-grammar-report-generator) includes instructions, references, a launcher, and runtime source with its lockfile. No separate repository clone is required.

The installer normally saves it to `$CODEX_HOME/skills/multilingual-grammar-report-generator`, or `~/.codex/skills/multilingual-grammar-report-generator` when `CODEX_HOME` is unset. It is available on your **next Codex turn**, including in other projects. If a same-named installation already exists, the installer stops instead of overwriting it; resolve that existing installation before reinstalling. Do not copy only `SKILL.md`.

System prerequisites are **Node.js 24.x** and **Python 3 with `venv` and `pip`**. On first use the launcher installs locked Node dependencies with `npm@11.18.0` and builds the bundled runtime. It also creates an isolated Sudachi environment when reading enrichment is first needed (Host finalization or OpenAI analysis). Normal skill use needs no global package installation or manual `npm ci` / build step. Initial dependency/dictionary setup requires network access; later runs reuse the installed dependencies and build while their source/configuration remains current. No LLM or model-weight download is needed.

SudachiPy 0.6.11 and SudachiDict-core 20260428 are pinned in [the requirements](.agents/skills/multilingual-grammar-report-generator/runtime/scripts/requirements-sudachi.txt). The dictionary is downloaded at initial setup; subsequent reading enrichment runs locally. `SUDACHI_PYTHON` can select an existing environment, but it must have these exact versions.

## Use in any Codex project

Open your working project in Codex, attach a text or subtitle file, and ask:

```text
$multilingual-grammar-report-generator

Analyze the entire attached Japanese subtitle file.
Use the current Host model, explain and translate in Simplified Chinese,
and provide one Japanese example with a Chinese translation for each grammar point.
Save the report to output/my-report in this project.
```

Codex prepares the selected input, the current Host authors the analysis, and the launcher validates it and adds deterministic readings. It produces `grammar-report.md` and `grammar-report.json` in your chosen output directory. Host mode needs no separate OpenAI API key. Reports and analysis caches remain in the calling project's output directory, not in the installed skill.

For explicit commands, locate the installed `SKILL.md` and use the launcher beside it. With the installer's default destination:

```bash
GRAMMAR_SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/multilingual-grammar-report-generator"
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" --help
```

If you used a custom destination, set `GRAMMAR_SKILL_DIR` to the skill's actual absolute directory. Commands work from any project: relative `--input`, `--output`, and `--host-response` paths resolve from the directory where you run the command. The launcher resolves its runtime from the installed skill, independently of that working directory.

## Features and scope

- Read UTF-8 TXT, SRT, VTT, ASS, SSA, and validated subtitle-package JSON—not arbitrary JSON.
- Reconstruct sentences while retaining cue IDs, timestamps, context links, and review flags.
- Recognize inline Japanese speaker labels (including furigana), carry speakers through unlabelled cues, and distinguish complete unpunctuated replies from connected clauses. Invisible format controls do not count toward the safety limit; EOF alone does not mark a complete reply as truncated.
- Use bounded dialogue context for Japanese inversions, postposed constituents and elliptical replies. High-signal cross-cue repairs allow at most three seconds, without crossing explicit speaker changes or overriding the length limit; ambiguous fragments still need review. Native multi-speaker cues keep their source timing and do not absorb adjacent unlabelled speech. The Host handoff retains all explicitly labelled people (also after sound annotations), without treating known sound effects as people.
- Explain grammar in context, including contractions, omitted elements, conditionals, and honorific language.
- Enrich Japanese readings with pinned SudachiPy and `sudachidict_core`; leave unresolved substantive out-of-vocabulary readings `null`.
- Validate analysis with Zod and final reports with JSON Schema; export JSON and Markdown.
- Cache valid sentence analyses and retry unfinished or invalid sentences.

The repository includes core runtime source, CLI, instructions, schemas, reading helpers, and tests. Generated reports, inputs, caches, Python environments, installed dependencies, model weights, and media are not published. Audio transcription, subtitle search, video synchronization checks, and learning-site generation are outside its scope.

## Analysis providers

| Provider | Purpose |
| --- | --- |
| `host` | Interactive default: the current Host authors analysis through a prepare → analyze → finalize handoff. |
| `openai` | API analysis only when explicitly requested; requires exported `OPENAI_API_KEY`. |
| `mock` | Deterministic fixtures for tests and CI, not real learning reports. |

There is no automatic fallback. An existing API key does not select OpenAI. Host mode is **not** an offline local LLM, and a plain CLI cannot invoke the current Host model. Ollama is not a provider. Sudachi supplies readings, not grammar explanations, translations, or proficiency levels.

### Host: prepare, analyze, finalize

Normally Codex performs these steps when you invoke the skill. To run the handoff explicitly, set `GRAMMAR_SKILL_DIR` as above, then prepare a file:

```bash
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" \
  --input "subtitles/episode.srt" \
  --analysis-provider host \
  --prepare-host \
  --explanation-language zh-CN \
  --output output/my-report
```

For direct text, replace `--input ...` with `--text "日本語を勉強しています。"`. Explanation and translation languages are `zh-CN` (default), `ja-JP`, and `en`.

The current Host must read the emitted `host-analysis-request.json`, `host-analysis-schema.json`, and [Host analysis instructions](.agents/skills/multilingual-grammar-report-generator/references/host-analysis.md), analyze every requested sentence, and write `output/my-report/host-analysis-response.json`. Preparation alone does not author analysis. Preserve sentence IDs, supply one original example and its translation per grammar point, and follow the schema. Pure-Japanese sentence readings and Japanese vocabulary readings should be `null` for deterministic enrichment.

Finalize from the same working directory with **the same output directory**, without passing the original input again:

```bash
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" \
  --analysis-provider host \
  --finalize-host \
  --output output/my-report
```

Finalization validates the response, enriches readings, and writes both reports. On `HOST_ANALYSIS_VALIDATION_FAILED`, read the rewritten request, have the Host correct only its unfinished IDs, and finalize again. Stop if the manifest reports `retry-exhausted`; do not switch providers.

The launcher defaults to Host preparation if no phase/provider is supplied. The lower-level CLI requires an explicit Host phase; otherwise it returns `HOST_CONTEXT_REQUIRED`.

### OpenAI: explicit opt-in only

Set `OPENAI_API_KEY` securely in your shell or Host environment first. The CLI does not automatically load `.env` files; [the example](.agents/skills/multilingual-grammar-report-generator/runtime/.env.example) documents available variables.

```bash
# Assumes OPENAI_API_KEY is already securely set in this shell.
export OPENAI_API_KEY
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" \
  --input "subtitles/episode.srt" \
  --analysis-provider openai \
  --model "<model-available-to-your-account>" \
  --explanation-language ja-JP \
  --output output/openai-report
```

Use a model accessible to your account that supports the required Responses API structured output. Model selection is `--model`, then `OPENAI_GRAMMAR_MODEL`, then the implementation default `gpt-5.6-sol`; that default does not guarantee account availability. This mode sends the selected text and context to the API and may incur charges. A missing key fails with `MISSING_OPENAI_API_KEY`. Do not commit credentials or include them in reports.

### Mock smoke test

```bash
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" \
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

Subtitle timing is retained; plain-text `start` and `end` remain `null`. Pure-Japanese sentence readings and Japanese vocabulary readings are enriched in a batch. Mixed-language sentence readings and example readings are not covered by that enrichment. Dictionary/helper versions participate in cache identity to avoid stale readings after upgrades.

Useful options: `--batch-size` (sentences per analysis batch, default 8), `--max-retries` (default 2), `--pause-threshold-seconds` (default 1.2), and `--host-response` for a custom response path. `--overwrite` replaces generated files within the selected output directory; use only when intended. Reuse a task directory for continuation, not unrelated inputs.

## Source development

Clone the repository to change the skill or runtime. The installable skill folder is the canonical copy; no release packaging or copying of runtime files is required. Root commands forward to the bundled runtime.

```bash
git clone https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator.git
cd Codex-Skills-multilingual-grammar-report-generator
npm run bootstrap
npm test
npm run typecheck
npm run grammar-report -- --help
```

`npm run bootstrap` installs locked dependencies and builds the runtime. Use `npm run build` to rebuild after source edits.

```text
.agents/skills/multilingual-grammar-report-generator/
  SKILL.md, references/        Skill instructions and report contract
  LICENSE                     License retained by skill-only installation
  scripts/                    Bootstrap, launcher, reading-environment setup
  runtime/
    apps/cli/                 Grammar-report CLI
    packages/                 Analysis pipeline, shared and subtitle code
    schemas/                  Report and subtitle contracts
    scripts/                  Sudachi helper and pinned requirements
    tests/                    Unit/integration tests and fixture
    package.json, package-lock.json, tsconfig.json
package.json                  Development command forwarding
```

The runtime lockfile pins dependencies. `.gitignore` excludes outputs, caches, environments, credentials, build products, model weights, and media. Inspect staged changes before publishing user data.

## Troubleshooting and limitations

- **Initial setup:** confirm Node 24.x and a working Node/npm toolchain, then rerun the same launcher command. Setup errors are reported rather than falling back to another provider. Check network access when dependencies or the pinned npm release cannot be downloaded.
- **Sudachi:** check `python3`, `venv`, `pip`, and download connectivity. With `SUDACHI_PYTHON`, install the pinned requirements in that environment or unset the override so the launcher can manage its own environment.
- **Paths:** use the launcher beside the loaded `SKILL.md`. A relative `.agents/skills/...` path in an unrelated working project does not identify a globally installed skill. Ensure relative input/output paths refer to your current project.
- **Host validation:** follow the failed-ID request rather than regenerating valid sentences or fabricating placeholders. See the [report contract](.agents/skills/multilingual-grammar-report-generator/references/report-contract.md).
- **API failures:** check explicit provider selection, credentials, and model access. There is no provider fallback.
- **Linguistic accuracy:** schema validation checks structure, not correctness. Short fragments, speaker changes, names, and OOV readings may need review. Empty grammar arrays can be appropriate for effects/interjections but may also merit review.
- **Sentence boundaries:** reconstruction is conservative, not a full syntax parser. Open quotes, unfinished connectives, ambiguous final fragments and forced-length groups still need review. It preserves each cue and its timing rather than inventing within-cue timestamps. Existing prepared reports are not silently regrouped after an upgrade; prepare the source again in a new output directory to use updated boundaries.
- **Cached context:** analyzer 1.1.0 uses a new analysis-cache identity after the dialogue-context changes. Older cache files are preserved but are not silently reused as if they had received the new contextual analysis.
- JLPT, HSK, and CEFR labels are learning estimates, not official certifications; uncertain mappings use `unknown` / `unmapped`.

## Feedback and license

Report reproducible problems through [GitHub Issues](https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator/issues), with a minimal authorized text example, provider, and expected behavior. Do not upload credentials, private data, or unauthorized subtitles/media.

[MIT](LICENSE).
