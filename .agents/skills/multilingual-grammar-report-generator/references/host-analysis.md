# Host grammar-analysis rules

Use these rules only after deterministic preparation has produced
`host-analysis-request.json`. The current Codex or ChatGPT Work model performs
the analysis directly and writes `host-analysis-response.json`; no model API,
local model runtime, nested Codex process, or UI automation is part of this
stage.

## Response contract

- Read the request's `resources.responseSchema` before responding.
- Return one response item for every requested sentence ID and no other IDs.
- Preserve sentence IDs exactly.
- Write one JSON object with a single `sentences` array and no Markdown or
  surrounding explanation.
- Do not add fields outside the supplied schema.
- Use `null`, `unknown`, or lower confidence when evidence is insufficient.
- Supply exactly one natural, original example sentence for every grammar
  point. It must demonstrate the point rather than copy the analyzed source
  sentence, and its translation must use the requested explanation language.
  Leave the example reading `null` when it cannot be supplied reliably.
- Set pure-Japanese sentence readings and Japanese vocabulary readings to
  `null`; finalization replaces them with deterministic SudachiPy results.
- Analyze only grammar supported by the sentence, its previous/next text,
  speakers, and timing context. Never turn ordinary vocabulary into grammar.

## Japanese

Check sentence patterns, particles, conjugation, auxiliaries, passive,
causative, causative-passive, honorific language, conditions, concession,
modality, pragmatic force, contractions, fixed expressions, relative clauses,
nominalization, discourse links, ellipsis, and omitted copulas. Use `JLPT`
levels `N5` through `N1` only when defensible; otherwise use `unknown`.

## Chinese

Check subject-predicate structure, 把/被 constructions, aspect markers,
comparison, result/directional/potential complements, serial verbs, pivotal
constructions, sentence-final particles, fixed patterns, discourse links, and
spoken ellipsis. Use `HSK` only for Chinese grammar when defensible; otherwise
use `unknown`.

## English

Check tense, aspect, voice, modals, conditionals, noun/relative/adverbial
clauses, infinitives, participles, gerunds, phrasal verbs, collocations,
ellipsis, discourse links, and pragmatic nuance. Use `CEFR` `A1` through `C2`
only when defensible; otherwise use `unknown`.

## Mixed language

Analyze each language span independently. Label every grammar point with the
language of its actual surface and use only that language's proficiency system.

## Retry

If finalization returns `HOST_ANALYSIS_VALIDATION_FAILED`, read the rewritten
`host-analysis-request.json`. It contains only failed or missing sentence IDs.
Rewrite the response for that request and finalize again. Do not reanalyze
sentences already stored in the sentence-level cache.
