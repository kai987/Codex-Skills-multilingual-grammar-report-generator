import {
  reconstructSubtitleSentences,
  type ReconstructedSentence,
} from "@mvl/grammar-report-core";
import type { SubtitleCue } from "@mvl/shared";
import { describe, expect, it } from "vitest";

function cue(index: number, text: string, speaker: string | null = null): SubtitleCue {
  return {
    id: `cue-${index + 1}`, start: index * 1.1, end: index * 1.1 + 1,
    text, speaker, language: "ja", languages: ["ja"], confidence: 1,
  };
}

function expectLossless(cues: readonly SubtitleCue[], sentences: readonly ReconstructedSentence[]): void {
  expect(sentences.flatMap(sentence => sentence.cueIds)).toEqual(cues.map(part => part.id));
  expect(new Set(sentences.map(sentence => sentence.id)).size).toBe(sentences.length);
  sentences.forEach((sentence, index) => {
    const parts = sentence.cueIds.map(id => cues.find(part => part.id === id)!);
    expect(sentence.text).toBe(parts.map(part => part.text).join(""));
    expect(sentence.start).toBe(parts[0]?.start);
    expect(sentence.end).toBe(parts.at(-1)?.end);
    expect(sentence.previousSentenceId).toBe(sentences[index - 1]?.id ?? null);
    expect(sentence.nextSentenceId).toBe(sentences[index + 1]?.id ?? null);
  });
}

describe("intentional Japanese turn fragments", () => {
  it("keeps a reformulation interrupted by another speaker without completing its words", () => {
    const cues = [
      cue(0, "というか あの… どちらの案にするか あの…", "A"),
      cue(1, "任せたぞ", "B"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes denial with a false start before an explicit follow-up question", () => {
    const cues = [
      cue(0, "いや な… いや…", "A"),
      cue(1, "どうしたんだよ？", "B"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes a hesitant suspended topic answering a preceding question", () => {
    const cues = [
      cue(0, "どうすればいいんですか？", "A"),
      cue(1, "あっ… あっ いや あの… そ… それは…", "B"),
      cue(2, "大丈夫です", "A"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes a consultation preface before a different speaker's acknowledgement", () => {
    const cues = [
      cue(0, "自動化しようと思ってるんだけど…", "A"),
      cue(1, "はい", "B"),
      cue(2, "相談に乗ってもらえますか？", "A"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("keeps the same speaker's concessive clause connected to its predicate", () => {
    const cues = [
      cue(0, "自動化しようと思ってるんだけど…", "A"),
      cue(1, "時間がありません", "A"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1", "cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes a line-wrapped unlabelled preface after an atomic multi-speaker cue", () => {
    const cues = [
      cue(0, "\u202a-（山田）あっ そうだ\n\u202a-（田中）はい"),
      cue(1, "\u202a業務を自動化しようと\n\u202a思ってるんだけど…"),
      cue(2, "\u202a（田中）はい"),
      cue(3, "\u202a相談に乗ってもらえますか？"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"], ["cue-4"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes an exact suspended echo of an unlabelled statement without inventing that speaker", () => {
    const cues = [
      cue(0, "それ以来 感情を失ってしまって…"),
      cue(1, "感情を…", "B"),
      cue(2, "別の話をしてもいいですか？", "C"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes the exact echo when it is the last cue rather than flagging it solely at EOF", () => {
    const cues = [
      cue(0, "それ以来 感情を失ってしまって…"),
      cue(1, "感情を…", "B"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes a startled echo with a retained case particle and a false start", () => {
    const cues = [
      cue(0, "ナオトと友達です", "A"),
      cue(1, "えっ 有名… ナ… ナオトと…", "B"),
      cue(2, "そうですよ", "A"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("does not mistake a same-speaker repeated object for a response", () => {
    const cues = [cue(0, "資料を準備しました", "A"), cue(1, "資料を…", "A")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[1]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not confirm an unlabelled non-echo merely because its noun appeared earlier", () => {
    const cues = [cue(0, "資料を準備しました", "A"), cue(1, "資料の…")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[1]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("requires an exact suspended constituent when the preceding speaker is unknown", () => {
    const cues = [cue(0, "資料を準備しました"), cue(1, "資料の…", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[1]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not mistake a pause before the same speaker's predicate for a handoff", () => {
    const cues = [cue(0, "あっ あの… 涙が…", "A"), { ...cue(1, "止まりません", "A"), start: 5, end: 6 }];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("keeps a known responder's echo attached to its own following predicate", () => {
    const cues = [
      cue(0, "資料を準備しました", "A"),
      cue(1, "資料を…", "B"),
      cue(2, "確認します", "B"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2", "cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("keeps a cause and interrupted subject intact before the next speaker's question", () => {
    const cues = [
      cue(0, "もう 猫アレルギーで アア… 涙が…", "A"),
      cue(1, "なぜ泣いているんですか？", "B"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("preserves cross-speaker pragmatic completion as two independently timed units", () => {
    const cues = [cue(0, "社長が…", "A"), cue(1, "かぶった", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("keeps the same-speaker subject and following predicate together", () => {
    const cues = [cue(0, "社長が…", "A"), cue(1, "来ました", "A")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1", "cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it.each(["あの資料を…", "昨日あった会議の資料を…", "それは…"])(
    "does not turn a demonstrative or lexical substring into a hesitation: %s",
    text => {
      const cues = [cue(0, text, "A"), cue(1, "どうしたんですか？", "B")];
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences[0]?.needsReview).toBe(true);
      expectLossless(cues, sentences);
    },
  );

  it("does not clear a bare object just because the next speaker gives an unrelated copular answer", () => {
    const cues = [cue(0, "資料を…", "A"), cue(1, "いいです", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not widen the pause threshold for a same-speaker concessive continuation", () => {
    const cues = [
      cue(0, "今は出世を望まないけど…", "A"),
      { ...cue(1, "彼ならきっと成功します", "A"), start: 4.069, end: 6 },
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each(["資料を…", "涙が…", "社長が…", "「それは…"])(
    "keeps unsupported or quoted EOF fragments under review: %s",
    text => {
      const cues = [cue(0, text, "A")];
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences).toHaveLength(1);
      expect(sentences[0]?.needsReview).toBe(true);
      expectLossless(cues, sentences);
    },
  );

  it("does not let a later different speaker hide an open quotation", () => {
    const cues = [cue(0, "「それは あの…", "A"), cue(1, "どうしたんですか？", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not let a later different speaker hide a forced-length split", () => {
    const cues = [cue(0, `${"あの… ".repeat(60)}涙が…`, "A"), cue(1, "どうしたんですか？", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("keeps a native multi-speaker cue atomic and does not borrow its first speaker for the next fragment", () => {
    const cues = [
      cue(0, "-（山田）資料は？\n-（田中）はい"),
      cue(1, "資料の…"),
      cue(2, "（山田）どうしたんですか？"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });
});
