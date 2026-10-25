import {
  reconstructSubtitleSentences,
  type ReconstructedSentence,
} from "@mvl/grammar-report-core";
import type { SubtitleCue } from "@mvl/shared";
import { describe, expect, it } from "vitest";

function dialogue(
  texts: readonly string[],
  gaps: readonly number[] = [],
  speakers: readonly (string | null)[] = [],
): SubtitleCue[] {
  let start = 0;
  return texts.map((text, index) => {
    const cue: SubtitleCue = {
      id: `cue-${index + 1}`, start, end: start + 1,
      text, speaker: speakers[index] ?? null,
      language: "ja", languages: ["ja"], confidence: 1,
    };
    start = Math.round((cue.end + (gaps[index] ?? 0.1)) * 1000) / 1000;
    return cue;
  });
}

function expectLossless(cues: readonly SubtitleCue[], sentences: readonly ReconstructedSentence[]): void {
  expect(sentences.flatMap(sentence => sentence.cueIds)).toEqual(cues.map(cue => cue.id));
  expect(new Set(sentences.map(sentence => sentence.id)).size).toBe(sentences.length);
  sentences.forEach((sentence, index) => {
    const parts = sentence.cueIds.map(id => cues.find(cue => cue.id === id)!);
    expect(sentence.text).toBe(parts.map(cue => cue.text).join(""));
    expect(sentence.start).toBe(parts[0]?.start);
    expect(sentence.end).toBe(parts.at(-1)?.end);
    expect(sentence.previousSentenceId).toBe(sentences[index - 1]?.id ?? null);
    expect(sentence.nextSentenceId).toBe(sentences[index + 1]?.id ?? null);
  });
}

describe("bounded Japanese clause chains and distinct speech actions", () => {
  it("keeps a pending topic through fillers, enumerated qualities and a contrasting evaluation", () => {
    const cues = dialogue([
      "前から思ってた", "山田は…", "うん まあ…", "頭もいいし",
      "技術もあるし", "だけど…", "すぐ心を閉ざす所があるよね",
    ], [0.4, 0.7, 0.1, 0.4, 1.1, 1.5], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([cues.map(cue => cue.id)]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("does not let an ellipsis on a filler close an unresolved topic", () => {
    const cues = dialogue(["山田は…", "うん まあ…", "仕事も速いし", "判断も的確です"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([cues.map(cue => cue.id)]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("retains an explicitly concessive chain across a bounded rhetorical pause", () => {
    const cues = dialogue([
      "俺はもうこの年だしさ", "出世は望まないけど…",
      "山田のような人が成功するんだろうなって思う",
    ], [0.935, 3.069], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([cues.map(cue => cue.id)]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("separates a judgement, startled denial and call before a new conditional stance", () => {
    const cues = dialogue([
      "そう思う", "えっ？いやいやいや…", "ちょっと待って 山田",
      "俺は…", "君が上司になるなら…", "応援したいし", "うれしいよ",
    ], [0.1, 0.1, 0.9, 3.169, 2.335, 1.268]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([
      ["cue-1"], ["cue-2"], ["cue-3"], ["cue-4", "cue-5", "cue-6", "cue-7"],
    ]);
    expect(sentences.every(sentence => !sentence.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each([1.5, 3.069, 4])("does not join independent complete statements across a %s second pause", pause => {
    const cues = dialogue(["資料を確認しました", "会議は明日です"], [pause], ["A", "A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences.every(sentence => !sentence.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not join a concessive fragment to an explicitly different person's answer", () => {
    const cues = dialogue(["準備したいけど…", "今日は無理です"], [2], ["A", "B"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not carry an enumeration through an explicit speaker change", () => {
    const cues = dialogue(["仕事も速いし…", "判断も的確です"], [1.5], ["A", "B"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("keeps a native multi-speaker cue atomic within a potential chain", () => {
    const cues = dialogue([
      "山田は…", "-（山田）頭もいいし\n-（田中）そうですね", "技術もあります",
    ], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(sentence => sentence.cueIds.includes("cue-2"))?.cueIds).toEqual(["cue-2"]);
    expectLossless(cues, sentences);
  });

  it.each(["頭もいいし…", "山田は…", "「山田は頭もいいし…"])(
    "keeps an unfinished or quoted final chain under review: %s",
    text => {
      const cues = dialogue([text], [], ["A"]);
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences).toHaveLength(1);
      expect(sentences[0]?.needsReview).toBe(true);
      expectLossless(cues, sentences);
    },
  );

  it("does not erase a pending topic when the file ends with only a filler", () => {
    const cues = dialogue(["山田は…", "うん まあ…"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.some(sentence => sentence.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not repair a clause chain through a pause beyond its bounded window", () => {
    const cues = dialogue(["彼は出世を望まないけど…", "実力は十分あります"], [4.001], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("retains the forced-length review instead of hiding it inside a complete chain", () => {
    const cues = dialogue([`${"とても".repeat(70)}頭もいいし…`, "技術もあります"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.some(sentence => sentence.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not mistake the lexical noun すし for an enumerating clause", () => {
    const cues = dialogue(["すし…", "会議は明日です"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expectLossless(cues, sentences);
  });

  it("retains an actual quoted continuation after a finite judgement", () => {
    const cues = dialogue(["そう思います", "と言われたんです"], [], ["A", "A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1", "cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("does not force a terminally punctuated judgement into the following topic", () => {
    const cues = dialogue(["前から思ってた。", "山田は技術もあります。"], [], ["A", "A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expectLossless(cues, sentences);
  });

  it("does not attach a new question as a completed concessive chain", () => {
    const cues = dialogue(["準備したいけど…", "ところで会議はいつですか？"], [2], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("preserves format controls and line wrapping while linking a supported chain", () => {
    const cues = dialogue([
      "\u202a山田は…", "\u202aうん まあ…", "\u202a頭もいいし", "\u202a判断も\n\u202a的確です",
    ], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([cues.map(cue => cue.id)]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("preserves ASCII suspension marks without interpreting them as sentence-final periods", () => {
    const cues = dialogue(["山田は...", "頭もいいし...", "判断も的確です"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(sentence => sentence.cueIds)).toEqual([cues.map(cue => cue.id)]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it.each(["頭もいいし。", "山田は。"])("never borrows a predicate across the explicit full stop in %s", first => {
    const cues = dialogue([first, "判断も的確です"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expectLossless(cues, sentences);
  });

  it("ends an existing enumeration at a punctuated item instead of swallowing the following statement", () => {
    const cues = dialogue(["頭もいいし…", "技術もあるし。", "明日は休みです"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1", "cue-2"], ["cue-3"]]);
    expectLossless(cues, sentences);
  });

  it("does not hide a quote opened before the start of a recognized clause chain", () => {
    const cues = dialogue(["「説明します", "山田は…", "頭もいいし", "判断も的確です"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.some(s => s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each(["ください", "から出発する"])("preserves the dependent wait continuation %s", second => {
    const cues = dialogue(["ちょっと待って", second], [], ["A", "A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1", "cue-2"]]);
    expectLossless(cues, sentences);
  });

  it("keeps the nominalized continuation after 思う attached", () => {
    const cues = dialogue(["そう思う", "のは私だけです"], [], ["A", "A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1", "cue-2"]]);
    expectLossless(cues, sentences);
  });

  it.each(["しかし…", "ただし…", "もし…"])("does not recognize the lexical ending of %s as enumeration", first => {
    const cues = dialogue([first], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("does not cross an acknowledgement while looking for the predicate of a topic", () => {
    const cues = dialogue(["山田は…", "はい", "頭もいいし", "判断も的確です"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-1"))?.cueIds).not.toContain("cue-3");
    expectLossless(cues, sentences);
  });

  it("does not cross a gap over four seconds even with multiple dependency signals", () => {
    const cues = dialogue(["頭もいいし", "人柄もいいけど…", "少し心配です"], [0.1, 4.001], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1", "cue-2"], ["cue-3"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each([
    ["ある", "日のことです"],
    ["とある", "会社で働いています"],
    ["あの人はそう思う", "はずです"],
    ["そう思う", "はずです"],
  ])("does not turn the attributive expression %s / %s into two independent predicates", (first, second) => {
    const cues = dialogue([first, second], [], ["A", "A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1", "cue-2"]]);
    expectLossless(cues, sentences);
  });

  it("does not treat an acknowledgement as the predicate of a following nominalization", () => {
    const cues = dialogue(["はい", "ことは終わりました"], [], ["A", "A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expectLossless(cues, sentences);
  });

  it("separates a completed proposal from the following additional topic", () => {
    const cues = dialogue(["記録を分かりやすくしましょう", "他社のデータも…", "取り込めるようにします"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2", "cue-3"]]);
    expectLossless(cues, sentences);
  });
});
