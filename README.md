# Multilingual Grammar Report Generator

English | [日本語](README.ja.md)

A Codex skill for turning Japanese, Chinese, English, and mixed-language text or subtitles into structured grammar-learning reports with explanations, vocabulary, and one translated example per grammar point.

> **Repository status:** This repository currently publishes project documentation and the MIT license. The runtime source, dependency manifests, and schemas have not been published here. The capabilities below describe the existing local implementation; cloning this repository alone does not provide a runnable installation.

## Capabilities

- Accept UTF-8 text and subtitles: TXT, SRT, VTT, ASS, SSA, and validated subtitle-package JSON.
- Reconstruct sentences while retaining subtitle cue IDs, timestamps, context links, and review flags.
- Explain grammar in context, including spoken contractions, omitted elements, conditionals, and honorific language.
- Provide exactly one original example and its translation for each identified grammar point.
- Use SudachiPy with `sudachidict_core` for Japanese readings; leave unresolved substantive out-of-vocabulary readings as `null`.
- Validate structured analysis with Zod and the final report with JSON Schema, then export `grammar-report.json` and `grammar-report.md`.

## Analysis providers

| Provider | Purpose |
| --- | --- |
| `host` | Default for interactive use: the current host model analyzes prepared sentences through a prepare → analyze → finalize handoff. |
| `openai` | OpenAI API analysis only when the user explicitly requests it; requires `OPENAI_API_KEY`. |
| `mock` | Deterministic fixtures for automated tests and CI, not real learning reports. |

There is no automatic fallback between providers. Host mode does not mean a local offline model: the CLI cannot invoke the current host model itself. Ollama is not an analysis provider in the current implementation. SudachiPy supplies readings, not grammar explanations or proficiency levels.

## Documentation and limitations

See the [Japanese README](README.ja.md) for the workflow, output files, prerequisites, and usage examples for an environment where the complete skill is already available.

Schema validation checks structure, not linguistic correctness. Subtitle fragments, names, and uncertain readings may require review. This project analyzes supplied text; it does not transcribe audio, find subtitles, or verify subtitle timing against a video. Use only material you are authorized to process or share.

## Feedback

Report reproducible problems or suggest improvements through [GitHub Issues](https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator/issues). Include a minimal text example and expected behavior; avoid uploading credentials, private data, or copyrighted media without permission.

## License

[MIT](LICENSE).
