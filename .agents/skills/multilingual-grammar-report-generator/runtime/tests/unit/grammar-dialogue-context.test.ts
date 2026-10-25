import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  loadGrammarInput,
  reconstructSubtitleSentences,
  analysisCacheKey,
  type ReconstructedSentence,
} from "@mvl/grammar-report-core";
import type { SubtitleCue } from "@mvl/shared";
import { afterEach, describe, expect, it } from "vitest";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true }),
  ));
});

function cue(index: number, text: string, speaker: string | null = null): SubtitleCue {
  return {
    id: `cue-${index + 1}`, start: index * 1.1, end: index * 1.1 + 1,
    text, speaker, language: "ja", languages: ["ja"], confidence: 1,
  };
}

function expectLossless(cues: readonly SubtitleCue[], sentences: readonly ReconstructedSentence[]): void {
  expect(sentences.flatMap(s => s.cueIds)).toEqual(cues.map(c => c.id));
  expect(new Set(sentences.map(s => s.id)).size).toBe(sentences.length);
  sentences.forEach((sentence, index) => {
    const parts = sentence.cueIds.map(id => cues.find(c => c.id === id)!);
    expect(sentence.text).toBe(parts.map(c => c.text).join(""));
    expect(sentence.start).toBe(parts[0]?.start);
    expect(sentence.end).toBe(parts.at(-1)?.end);
    expect(sentence.previousSentenceId).toBe(sentences[index - 1]?.id ?? null);
    expect(sentence.nextSentenceId).toBe(sentences[index + 1]?.id ?? null);
  });
}

async function syntheticSrt(texts: readonly string[]): Promise<SubtitleCue[]> {
  const directory = await mkdtemp(path.join(tmpdir(), "grammar-dialogue-context-"));
  temporaryPaths.push(directory);
  const inputPath = path.join(directory, "dialogue.srt");
  const clock = (n: number) => `00:00:${String(n).padStart(2, "0")},000`;
  await writeFile(inputPath, texts.map((text, i) =>
    `${i + 1}\n${clock(i * 2)} --> ${clock(i * 2 + 1)}\n${text}\n`,
  ).join("\n"), "utf8");
  return (await loadGrammarInput({ inputPath })).cues;
}

describe("Japanese dialogue context and inversion regressions", () => {
  it("does not reuse a pre-context-fix analysis cache key for unchanged text", () => {
    const sentence = reconstructSubtitleSentences([cue(0, "確認しました。")])[0]!;
    const previousKey = createHash("sha256").update(JSON.stringify({
      text: sentence.text, language: sentence.language, languages: sentence.languages,
      previousText: null, nextText: null, analysisProvider: "host", schemaVersion: "1.0.0",
      analyzerVersion: "1.0.0", configurationHash: "same-model", explanationLanguage: "zh-CN",
    })).digest("hex");
    expect(analysisCacheKey(sentence, "same-model", "zh-CN", "host")).not.toBe(previousKey);
  });
  it.each([
    ["怖いんだ", "失敗するのが"],
    ["準備してきました", "彼が"],
    ["感謝しています", "あなたの支えに"],
    ["覚えていますか？", "去年の旅行を"],
    ["分かっています", "今は難しいと"],
    ["何なんだ？", "あの人は"],
    ["どうしてだろう？", "町が明るく見えるのは"],
  ])("reattaches the postposed fragment %s / %s at a short same-turn gap", (predicate, tail) => {
    const cues = [cue(0, predicate, "A"), cue(1, tail)];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("allows a bounded rhetorical pause for an otherwise unambiguous postposed subject", () => {
    const cues = [
      cue(0, "準備してきました", "A"),
      { ...cue(1, "彼が"), start: 3.4, end: 4.2 },
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it.each([
    "怖いんだ、失敗するのが",
    "準備してきました、彼が",
    "感謝しています、あなたの支えに",
    "覚えていますか？ 去年の旅行を",
    "分かっています、今は難しいと",
    "何なんだ？ あの人は",
  ])("recognizes a complete inversion within a single cue: %s", text => {
    const cues = [cue(0, text)];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it.each(["私も行くの", "これは大切な仕事なの", "早めに準備するだけなの"])(
    "does not confuse the explanatory ending %s with an unfinished genitive",
    text => {
      const cues = [cue(0, text)];
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences[0]?.needsReview).toBe(false);
      expectLossless(cues, sentences);
    },
  );

  it.each([
    ["誰に会ったの？", "その人に"],
    ["どこにいますか？", "あちらに"],
    ["出席できますか？", "はい、途中までですが"],
  ])("uses the preceding question to recognize an elliptical reply: %s / %s", (question, answer) => {
    const cues = [cue(0, question, "A"), cue(1, answer, "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]?.cueIds).toEqual(["cue-2"]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it.each(["確かに", "あっ 確かに", "いえ、別に", "ああ、確かに"])("recognizes the lexical short response %s", text => {
    const cues = [cue(0, text)];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes sound-prefaced speech without rewriting either source line", () => {
    const cues = [cue(0, "（鼻をすする音）\nあっ、いや…", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("recognizes a deictic location with an omitted existence predicate", () => {
    const cues = [cue(0, "担当者はあちらに", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("uses affirmative answer evidence when the responding speaker is unlabelled", () => {
    const cues = [cue(0, "最後まで見たのか？", "A"), cue(1, "はい、途中までですが")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("retains the question speaker through unlabelled continuations before an elliptical answer", () => {
    const cues = [cue(0, "誰に", "A"), cue(1, "会ったの？"), cue(2, "その人に", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1", "cue-2"], ["cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("keeps a context-supported repeated object as a separate response", () => {
    const cues = [cue(0, "感情を失いました", "A"), cue(1, "感情を…", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("accepts an interrupted hesitation at an explicit turn boundary without inventing its predicate", () => {
    const cues = [
      cue(0, "大丈夫ですか？", "A"),
      cue(1, "いやいや…", "B"),
      cue(2, "どうしたんですか？", "A"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expect(sentences[1]?.text).toBe("いやいや…");
    expectLossless(cues, sentences);
  });

  it.each(["それは違うと思うけど", "見せたかったのに"])(
    "accepts a stance/regret ending before another speaker responds: %s",
    text => {
      const cues = [cue(0, text, "A"), cue(1, "そうですか。", "B")];
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences).toHaveLength(2);
      expect(sentences[0]?.needsReview).toBe(false);
      expectLossless(cues, sentences);
    },
  );

  it("retains a genuine concessive continuation by the same speaker", () => {
    const cues = [cue(0, "資料を読みましたけど", "A"), cue(1, "内容は分かりません", "A")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it.each([
    ["行くの", "が好きです"],
    ["大事なの", "は準備です"],
    ["昨日買ったの", "を返しました"],
  ])("does not steal a nominalizer for an explanatory ending: %s / %s", (first, second) => {
    const cues = [cue(0, first), cue(1, second)];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("does not clear an unfinished same-speaker repetition as if it were an echo reply", () => {
    const cues = [cue(0, "資料を準備しました", "A"), cue(1, "資料を…", "A")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each(["はい、分かりました", "がんばります"])("does not confuse the lexical start of %s with a nominalizing particle", second => {
    const cues = [cue(0, "大事なの"), cue(1, second)];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expectLossless(cues, sentences);
  });

  it("does not merge nominalized clauses through a pause that requires a boundary", () => {
    const cues = [cue(0, "行くの"), {...cue(1, "が好きです"), start: 6, end: 7}];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expectLossless(cues, sentences);
  });

  it.each(["準備しました", "私は準備してきました"])("leaves an ambiguous subject after %s for review", first => {
    const cues = [cue(0, first), cue(1, "彼が")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each([
    ["終わりました", "彼が次を説明します"],
    ["怖いんだ", "新しい計画は必要です"],
    ["分かっています。", "今日の予定はここまでです。"],
  ])("does not append an independent next predicate as an inverted tail: %s / %s", (first, second) => {
    const cues = [cue(0, first), cue(1, second)];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expectLossless(cues, sentences);
  });

  it("does not reattach a fragment spoken by an explicitly different person", () => {
    const cues = [cue(0, "怖いんだ", "A"), cue(1, "失敗するのが", "B")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("lets a subject attach to its following predicate rather than stealing it for the preceding sentence", () => {
    const cues = [
      cue(0, "準備しました", "A"),
      cue(1, "彼が"),
      cue(2, "来る予定です"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2", "cue-3"]]);
    expect(sentences.every(s => !s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not reattach an inverted-looking fragment across a long silence", () => {
    const cues = [cue(0, "怖いんだ", "A"), { ...cue(1, "失敗するのが"), start: 7, end: 8 }];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each(["担当者が", "担当者に", "資料を", "彼の", "確認してもらい", "雨が降るので", "「分かりました"])(
    "keeps an unsupported or syntactically open final fragment under review: %s",
    text => {
      const cues = [cue(0, text)];
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences[0]?.needsReview).toBe(true);
      expectLossless(cues, sentences);
    },
  );

  it("retains the safety review for a forced-overlong predicate and does not hide it by appending a subject", () => {
    const cues = [cue(0, `${"とても".repeat(80)}怖いんだ`), cue(1, "彼が")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences.some(s => s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("keeps a native two-speaker cue separate from a later unlabelled clause", async () => {
    const texts = [
      "\u202a-（山田）あっ、田中さん\n\u202a-（田中）はい",
      "\u202a業務を変えようと思っているんだけど…",
    ];
    const cues = await syntheticSrt(texts);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-0001"], ["cue-0002"]]);
    expectLossless(cues, sentences);
  });
});
