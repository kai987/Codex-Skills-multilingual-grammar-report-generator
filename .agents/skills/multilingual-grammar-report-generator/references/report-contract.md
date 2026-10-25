# Grammar report contract

Treat `runtime/schemas/grammar-report.schema.json` within the installed skill as
the stable Skill 2 → Skill 3
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
change, a configurable pause, a confidently complete Japanese predicate, or
the maximum safe visible length. Detect inline Japanese speaker labels and
furigana without treating sound/action annotations as names; carry the active
speaker through unlabelled continuation cues. Ignore Unicode format controls
for boundary decisions and length accounting, but preserve source text.
Inspect the next cue before closing an unpunctuated predicate: quotation,
nominalization and connective continuations can still depend on it. Keep
reason/benefactive/conditional chains together until their final predicate.
Preserve every contributing cue ID and the first/last time; do not fabricate
within-cue timing. EOF alone is not a reason to request review: complete short
replies remain complete without a final period. Unclosed quotes, unfinished
connectives, ambiguous fragments and forced-length groups still require
review. These conservative heuristics are not a full Japanese syntax parser.

Japanese dialogue needs constituent and turn context, not just suffix tests.
Recognize same-cue inversions and high-signal predicate/afterthought pairs,
including postposed subjects, objects, topics and quoted content. Postposed-
constituent repair is bounded to three seconds, requires compatible speaker evidence and
stays below the visible-length limit; it does not relax ordinary pause rules
globally. A following predicate takes priority over borrowing a bare subject
for the previous clause. Native multi-speaker cues remain atomic and separate
from adjacent cues; never infer the next unlabelled cue belongs to their first
speaker. The Host handoff includes every explicitly labelled person, including people
after leading sound annotations, and excludes known sound/action labels.
Complete explanatory endings, acknowledgement/denial responses and
question-supported ellipsis are distinct from missing predicates. Standalone
stance/regret endings are considered only at a turn boundary. Preserve the
case/topic continuation in nominalizations such as `行くの / が好きです`.
Ambiguous bare constituents, unclosed quotations and genuine forced splits
retain review flags. A confirmed boundary can still contain an intentional
hesitation or an interrupted utterance; do not silently supply its predicate.

Treat turn completion separately from syntactic completion. Consult the next
cue's explicit speaker evidence and reply text when recognizing hesitation,
reformulation, a consultation preface such as `思ってるんだけど…`, or a
deliberately interrupted case-marked constituent. A pause or EOF is not
equivalent to an explicit handoff. Recognize a short echoed constituent only
with supporting adjacent wording and turn context; an unlabelled preceding
cue is not permission to invent a speaker. Cross-speaker pragmatic completion
still keeps both speakers' original cue groups and times separate. Preserve
same-speaker continuations instead of closing them merely on hesitation or
ellipsis. Bare unsupported constituents, open quotes and forced-length splits
remain reviewable. These rules do not widen the three-second inversion repair
window or the ordinary pause threshold, and are not audio-verified diarization.

Open topics and predicate-bearing `し` enumeration may continue through `まあ`
fillers into a concession, condition and final judgement. A filler does not
complete the pending clause, and lexical endings such as `すし` or `しかし`
are not enumeration. Clause-chain lookahead scans at most 12 cues,
each gap no more than four seconds and combined visible length below 180.
Crossing the ordinary pause threshold additionally requires at least two
explicit dependency signals and a clear final predicate; a lone connective
does not justify a longer merge. This does not change the ordinary pause or
three-second postposed-constituent limits. Stop at explicit speaker changes,
native multi-speaker cues, open quotes, independent responses/questions,
calls or discourse resets. Keep unsupported or unfinished chains reviewable.
Separate completed judgements, startled denials, calls and new stances when
their wording establishes distinct speech actions, without inferring voices.
Retain actual quoted, nominalized and `待って / ください・から…` continuations.

Analyzer-version changes invalidate prior analysis cache identities; preserve
the old cache files, but do not treat stale context-dependent results as fresh
analysis. Already prepared reports are not silently regrouped by an upgrade.

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
sentence and Japanese vocabulary surface to the pinned skill-local
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
