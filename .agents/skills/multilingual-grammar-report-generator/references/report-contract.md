# Grammar report contract

Treat `schemas/grammar-report.schema.json` as the stable Skill 2 → Skill 3
output contract. Require Zod validation of each structured analysis and JSON
Schema validation of the complete report. Keep `start` and `end` null for
ordinary text, use `mixed` for sentence-level code switching, attach every
grammar point to its own language, and never apply JLPT to English, CEFR to
Japanese, or HSK to English/Japanese.

Require exactly one natural, original example sentence for every grammar
point. The example must demonstrate that point instead of copying the analyzed
source sentence. Its translation follows the report explanation language;
leave its reading `null` when a reliable reading is unavailable.

Sentence reconstruction closes a group on terminal punctuation, a speaker
change, a configurable pause, or the maximum safe length. Preserve every
contributing cue ID and the first/last time. Mark uncertain end-of-input or
forced-length groups for review.

The public analysis providers are exactly:

- `host`: current Codex/ChatGPT Work model through a prepare → Host analyze →
  finalize JSON handoff;
- `openai`: OpenAI Responses API structured output after explicit user opt-in;
- `mock`: deterministic automated-test and evaluation adapter.

Never infer OpenAI permission from `OPENAI_API_KEY`, never expose Ollama as an
analysis provider, and never fall back automatically between providers. A
plain Node process cannot call the current Host model and must use the handoff
or return `HOST_CONTEXT_REQUIRED`.

For Host, write `host-analysis-request.json` and
`host-analysis-schema.json`, let the current Host model write
`host-analysis-response.json`, then validate and finalize. Persist valid
sentence results before reporting invalid or missing sentences. Rewrite the
request with only unfinished IDs and return
`HOST_ANALYSIS_VALIDATION_FAILED` after a failed response.

After a Host or OpenAI batch passes Zod validation, send every pure-Japanese
sentence and Japanese vocabulary surface to the pinned project-local
SudachiPy `core` dictionary in one process invocation. Replace model readings
with hiragana output and leave a reading null when a substantive
out-of-vocabulary token cannot be resolved without guessing. Validate the
enriched analyses with Zod again. Include helper, library, dictionary,
split-mode, output-script, and OOV-policy versions in the configuration hash.
Do not use Sudachi for translation, grammar meaning, or proficiency levels.

Use OpenAI Responses API with `zodTextFormat` only after explicit OpenAI API
selection. Require `OPENAI_API_KEY` and return `MISSING_OPENAI_API_KEY` when it
is absent. Do not switch to Host or Mock on failure.

Cache each valid sentence independently. The cache identity covers sentence
text, detected language, previous/next text, provider, analyzer and prompt
configuration, explanation language, schema version, and deterministic reading
configuration. Persist progress in `analysis-manifest.json`, retry only missing
or failed sentence IDs, and write `input-info.json`,
`normalized-text.txt`, `sentences.json`, `analysis-manifest.json`,
`grammar-report.json`, and `grammar-report.md` atomically. Reject arbitrary
JSON objects instead of guessing their shape.
