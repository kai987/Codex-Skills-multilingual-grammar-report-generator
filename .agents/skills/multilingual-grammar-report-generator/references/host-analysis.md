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

When reviewing subtitle boundaries, distinguish inverted questions, postposed
subjects/objects/quoted content, ellipsis in replies, and incomplete syntax.
Use adjacent cues and explicit speaker evidence; a final `に`, `が`, `を`,
`の`, `けど` or `のに` alone does not settle the boundary. Do not mistake an
explanatory `の` for a nominalizer before a following case/topic particle.
Keep native multi-speaker cues intact with their original timing. Confirming
an intentional pause or interrupted turn does not authorize adding missing
words or assigning an unlabelled voice to a person. Examples for ellipsis
should demonstrate the ellipsis, not only the corresponding complete clause.

For hesitation, reformulation and echo replies, inspect the actual adjacent
words and distinguish an explicit speaker handoff from a long pause or EOF.
An echo can repeat a case-marked constituent from a suspended, unlabelled
preceding turn; do not require a polished complete sentence or invent its
speaker. A consultation preface ending in `思ってるんだけど…` followed by
an acknowledgement can have a confirmed boundary without a missing written
predicate. Conversely, keep a same-speaker continuation linked when the next
cue supplies that predicate. If another person completes an interrupted
utterance, explain the cross-turn relationship without merging speakers or
adding the completion to the first person's source text. Keep unsupported
bare fragments under review rather than clearing every ellipsis.

For topic, enumeration, concession and conditional chains, distinguish a
pending syntactic dependency from an independent response. `まあ…` does not
finish an open topic; predicate-bearing `し` can introduce further reasons or
qualities, while standalone `だけど` can contrast them with a final evaluation.
Require a clear concluding predicate before confirming a chain across a
rhetorical pause. A pause alone neither proves a turn change nor authorizes a
merge. Keep a completed thought, startled denial, call to wait and subsequent
stance separate when supported by the words, and preserve true quoted or
nominalized continuations. Automatic clause-chain limits are conservative
safety bounds, not evidence that every chain inside them is correct; inspect
remaining flags and do not assign unlabelled voices from the proposed grouping.

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
