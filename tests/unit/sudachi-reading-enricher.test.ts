import {
  SudachiJapaneseReadingEnricher,
  type ReconstructedSentence,
  type SentenceAnalysis,
} from "@mvl/grammar-report-core";
import { describe, expect, it, vi } from "vitest";

function sentence(
  id: string,
  language: ReconstructedSentence["language"],
  languages: ReconstructedSentence["languages"],
  text: string,
): ReconstructedSentence {
  return {
    id,
    cueIds: [],
    start: null,
    end: null,
    language,
    languages,
    text,
    previousSentenceId: null,
    nextSentenceId: null,
    reconstructionConfidence: 1,
    needsReview: false,
  };
}

function analysis(input: {
  sentenceId: string;
  reading: string | null;
  vocabulary: SentenceAnalysis["vocabulary"];
}): SentenceAnalysis {
  return {
    sentenceId: input.sentenceId,
    reading: input.reading,
    translation: null,
    grammar: [],
    vocabulary: input.vocabulary,
  };
}

describe("SudachiJapaneseReadingEnricher", () => {
  it("overrides a complete Japanese batch and preserves non-Japanese readings", async () => {
    const batchRunner = vi.fn((request: unknown) => {
      expect(request).toEqual({
        items: [
          { id: "sentence:ja-1", text: "物件を見て、抽象度を考える。" },
          { id: "vocabulary:ja-1:0", text: "物件" },
          { id: "vocabulary:ja-1:1", text: "未知固有名" },
          { id: "vocabulary:mixed-1:0", text: "資産" },
        ],
      });
      return Promise.resolve({
        engine: {
          helperVersion: "1.0.0",
          sudachiPyVersion: "0.6.11",
          dictionaryVersion: "20260428",
          dictionary: "core",
          splitMode: "C",
          outputScript: "hiragana",
        },
        items: [
          {
            id: "sentence:ja-1",
            reading: "ぶっけんをみて、ちゅうしょうどをかんがえる。",
            unresolvedOov: [],
          },
          {
            id: "vocabulary:ja-1:0",
            reading: "ぶっけん",
            unresolvedOov: [],
          },
          {
            id: "vocabulary:ja-1:1",
            reading: null,
            unresolvedOov: ["未知固有名"],
          },
          {
            id: "vocabulary:mixed-1:0",
            reading: "しさん",
            unresolvedOov: [],
          },
        ],
      });
    });
    const enricher = new SudachiJapaneseReadingEnricher({
      batchRunner,
      batchRunnerConfigurationHash: "test-batch-runner-v1",
    });
    const sentences = [
      sentence("ja-1", "ja", ["ja"], "物件を見て、抽象度を考える。"),
      sentence("en-1", "en", ["en"], "Read the report."),
      sentence("mixed-1", "mixed", ["ja", "en"], "資産 or lifestyle"),
    ];
    const analyses = [
      analysis({
        sentenceId: "ja-1",
        reading: "ものけいをみって、ちようそうどをかんがえる。",
        vocabulary: [
          {
            surface: "物件",
            language: "ja",
            reading: "ものけい",
            meaning: "房产",
          },
          {
            surface: "未知固有名",
            language: "ja",
            reading: "みちこゆうめい",
            meaning: "未知专名",
          },
        ],
      }),
      analysis({
        sentenceId: "en-1",
        reading: "existing English reading",
        vocabulary: [
          {
            surface: "report",
            language: "en",
            reading: "existing",
            meaning: "报告",
          },
        ],
      }),
      analysis({
        sentenceId: "mixed-1",
        reading: "existing mixed reading",
        vocabulary: [
          {
            surface: "資産",
            language: "ja",
            reading: "wrong",
            meaning: "资产",
          },
        ],
      }),
    ];

    const result = await enricher.enrich(sentences, analyses);

    expect(batchRunner).toHaveBeenCalledOnce();
    expect(result[0]?.reading).toBe(
      "ぶっけんをみて、ちゅうしょうどをかんがえる。",
    );
    expect(result[0]?.vocabulary.map((item) => item.reading)).toEqual([
      "ぶっけん",
      null,
    ]);
    expect(result[1]).toMatchObject({
      reading: "existing English reading",
      vocabulary: [{ reading: "existing" }],
    });
    expect(result[2]).toMatchObject({
      reading: "existing mixed reading",
      vocabulary: [{ reading: "しさん" }],
    });
  });

  it("rejects a response that omits a requested reading", async () => {
    const enricher = new SudachiJapaneseReadingEnricher({
      batchRunner: () =>
        Promise.resolve({
          engine: {
            helperVersion: "1.0.0",
            sudachiPyVersion: "0.6.11",
            dictionaryVersion: "20260428",
            dictionary: "core",
            splitMode: "C",
            outputScript: "hiragana",
          },
          items: [],
        }),
      batchRunnerConfigurationHash: "test-batch-runner-v1",
    });

    await expect(
      enricher.enrich(
        [sentence("ja-1", "ja", ["ja"], "物件")],
        [
          analysis({
            sentenceId: "ja-1",
            reading: null,
            vocabulary: [],
          }),
        ],
      ),
    ).rejects.toThrow("SudachiPy omitted a requested reading ID");
  });
});
