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

describe("sentence-final shi, enumerative continuations and renyo stems", () => {
  it("keeps a context-supported additive shi as a terminal turn before a contrasting reset", () => {
    const cues = dialogue([
      "入社前は熱意があったよ",
      "入ってからも会社に誇りを持ってたし",
      "ただ、働くうちに考えが変わりました",
    ], [1.5, 2.936], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("preserves format controls and wrapped clauses when confirming terminal additive shi", () => {
    const cues = dialogue([
      "\u202a学生の頃は夢があったよ",
      "\u202a卒業してからも\n\u202a希望を持ってたし…",
      "\u202aただ、今は考えが違います",
    ], [1.5, 2.5], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2"], ["cue-3"]]);
    expect(sentences[1]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("does not clear an unsupported shi merely because a following cue starts with ただ", () => {
    const cues = dialogue(["彼は優しいし", "ただ、今日は忙しいです"], [2.9], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each(["彼は優しいし", "彼は優しいし…", "会社に誇りを持ってたし"])(
    "does not clear unsupported EOF shi without adjacent context: %s",
    text => {
      const cues = dialogue([text], [], ["A"]);
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences[0]?.needsReview).toBe(true);
      expectLossless(cues, sentences);
    },
  );

  it("keeps shi attached when the next cue actually supplies a continuing statement", () => {
    const cues = dialogue(["彼は優しいし", "相談も聞いてくれるんです"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1", "cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("retains a listed attitude through a dative phrase to the concluding wish", () => {
    const cues = dialogue([
      "私は彼のこと好きだし", "尊敬してるし", "あんな人に…", "成功してほしいって思ってる",
    ], [1.0, 1.6, 0.8], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([cues.map(cue => cue.id)]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("retains formatting controls in the dative-dependent enumerative chain", () => {
    const cues = dialogue([
      "\u202a私は彼を信頼してるし", "\u202a親切な人だし", "\u202aあのような人に…", "\u202a来てほしいって\n\u202a思ってる",
    ], [0.4, 1.4, 0.8], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([cues.map(cue => cue.id)]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it("does not clear an unfinished dative-dependent enumeration at EOF", () => {
    const cues = dialogue(["私は彼のこと好きだし", "あんな人に…"], [1.5], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.some(s => s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("keeps a renyo continuation distinct from connective shi while linking its nominal conclusion", () => {
    const cues = dialogue([
      "運営は任せっきりだったし",
      "心を閉ざし、他人に寄り添えない今の私は",
      "ただの役立たず",
    ], [2.0, 0.1], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([cues.map(cue => cue.id)]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it.each(["扉を閉ざし…", "資料を探し…", "扉を閉ざし", "資料を探し"])(
    "keeps an unsupported renyo stem under review at EOF: %s",
    text => {
      const cues = dialogue([text], [], ["A"]);
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences[0]?.needsReview).toBe(true);
      expectLossless(cues, sentences);
    },
  );

  it.each(["能なし…", "寿司…", "すし…", "私…"])(
    "does not turn the noun %s into a connective or verb-stem chain",
    text => {
      const cues = dialogue([text, "会議は明日です"], [], ["A"]);
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
      expectLossless(cues, sentences);
    },
  );

  it("does not borrow a nominal conclusion through an explicit speaker change", () => {
    const cues = dialogue([
      "運営は任せっきりだったし", "心を閉ざし、今の私は", "ただの役立たず",
    ], [0.1, 0.1], ["A", null, "B"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-3"))?.cueIds).toEqual(["cue-3"]);
    expectLossless(cues, sentences);
  });

  it("does not cross a multi-speaker cue inside a listed-attitude chain", () => {
    const cues = dialogue([
      "私は彼のこと好きだし", "-（山田）尊敬してるし\n-（田中）はい", "あんな人に…", "成功してほしいと思っています",
    ], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-2"))?.cueIds).toEqual(["cue-2"]);
    expectLossless(cues, sentences);
  });

  it("does not repair through a gap over four seconds after a renyo-dependent clause", () => {
    const cues = dialogue([
      "運営は任せっきりだったし", "心を閉ざし、今の私は", "ただの役立たず",
    ], [0.1, 4.001], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-1"))?.cueIds).not.toContain("cue-3");
    expect(sentences.some(s => s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not erase an open quote by recognizing an internal renyo or nominal predicate", () => {
    const cues = dialogue(["「運営は任せっきりだったし", "心を閉ざし、今の私は", "ただの役立たず"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.some(s => s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("keeps forced-length groups reviewable even when their final stem looks like a renyo form", () => {
    const cues = dialogue([`${"ずっと".repeat(70)}心を閉ざし…`, "今の私は", "ただの役立たず"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.some(s => s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not merge a hard-stopped enumerative clause into a dative-dependent proposal", () => {
    const cues = dialogue(["私は彼のこと好きだし。", "あんな人に…", "成功してほしいと思っています"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-1"))?.cueIds).toEqual(["cue-1"]);
    expectLossless(cues, sentences);
  });

  it.each(["尊敬してるし…", "親切な人だし…"])("keeps the bare predicate-bearing enumeration %s reviewable at EOF", text => {
    const cues = dialogue([text], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences[0]?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each([[4.001, 2], [1.5, 4.001]])("does not reuse backward or forward context across an excessive gap %s / %s", (firstGap, secondGap) => {
    const cues = dialogue(["以前は夢があったよ", "入ってからも希望を持ってたし", "ただ、今は違います"], [firstGap, secondGap], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-2"))?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not use a prior question as retrospective statement evidence", () => {
    const cues = dialogue(["入社前は夢がありましたか？", "入ってからも希望を持ってたし", "ただ、今は違います"], [1.5, 2], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-2"))?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not infer terminal-additive intent across an explicitly different next speaker", () => {
    const cues = dialogue(["以前は夢があったよ", "入ってからも希望を持ってたし", "ただ、今は違います"], [1.5, 2], ["A", "A", "B"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-2"))?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it("does not borrow retrospective evidence from a native multi-speaker cue", () => {
    const cues = dialogue(["-（山田）そうですね\n-（田中）以前は夢があったよ", "入ってからも希望を持ってたし", "ただ、今は違います"], [1.5, 2]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.find(s => s.cueIds.includes("cue-2"))?.needsReview).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each(["人は多いです", "のは私だけです", "はずです"])("retains the relative or nominal continuation after 思ってる: %s", second => {
    const cues = dialogue(["成功してほしいって思ってる", second], [], ["A", "A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1", "cue-2"]]);
    expectLossless(cues, sentences);
  });

  it.each(["和風だし…", "鰹だし…", "昆布だし…"])("does not invent a nominal-predicate shi in the lexical noun %s", text => {
    const cues = dialogue([text, "会議は明日です"], [], ["A"]);
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map(s => s.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });
});
