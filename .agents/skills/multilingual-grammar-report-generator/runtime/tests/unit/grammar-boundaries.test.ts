import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  loadGrammarInput,
  reconstructSubtitleSentences,
  type ReconstructedSentence,
} from "@mvl/grammar-report-core";
import type { SubtitleCue } from "@mvl/shared";
import { extractSpeaker } from "@mvl/subtitle-core";
import { afterEach, describe, expect, it } from "vitest";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function cue(
  index: number,
  text: string,
  speaker: string | null = null,
  language: SubtitleCue["language"] = "ja",
): SubtitleCue {
  return {
    id: `cue-${index + 1}`,
    start: index * 1.1,
    end: index * 1.1 + 1,
    text,
    speaker,
    language,
    languages: [language],
    confidence: 1,
  };
}

function expectLossless(
  cues: readonly SubtitleCue[],
  sentences: readonly ReconstructedSentence[],
): void {
  expect(sentences.flatMap((s) => s.cueIds)).toEqual(cues.map((c) => c.id));
  expect(new Set(sentences.map((s) => s.id)).size).toBe(sentences.length);
  sentences.forEach((sentence, index) => {
    const contributing = sentence.cueIds.map((id) => cues.find((c) => c.id === id)!);
    expect(sentence.start).toBe(contributing[0]?.start);
    expect(sentence.end).toBe(contributing.at(-1)?.end);
    expect(sentence.previousSentenceId).toBe(sentences[index - 1]?.id ?? null);
    expect(sentence.nextSentenceId).toBe(sentences[index + 1]?.id ?? null);
    if (contributing.every((c) => c.language === "ja")) {
      expect(sentence.text).toBe(contributing.map((c) => c.text).join(""));
    }
  });
}

function srtClock(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000);
  return `00:00:${String(Math.floor(milliseconds / 1000)).padStart(2, "0")},${String(milliseconds % 1000).padStart(3, "0")}`;
}

async function loadSyntheticSrt(texts: readonly string[]) {
  const directory = await mkdtemp(path.join(tmpdir(), "grammar-boundaries-"));
  temporaryPaths.push(directory);
  const inputPath = path.join(directory, "synthetic.srt");
  const content = texts.map((text, i) =>
    `${i + 1}\n${srtClock(i * 1.1)} --> ${srtClock(i * 1.1 + 1)}\n${text}\n`,
  ).join("\n");
  await writeFile(inputPath, content, "utf8");
  return loadGrammarInput({ inputPath });
}

describe("subtitle sentence boundary regressions", () => {
  it("recognizes Japanese speaker tags with ruby and direction controls without rewriting source text", async () => {
    const texts = [
      "\u202a（田中(たなか)）準備の話は",
      "\u202aまだ相談しているので",
      "\u202a（佐藤(さとう)）分かりました",
    ];
    const loaded = await loadSyntheticSrt(texts);
    expect(loaded.cues.map((c) => c.text)).toEqual(texts);
    expect(loaded.cues.map((c) => c.speaker)).toEqual(["田中", null, "佐藤"]);
    const sentences = reconstructSubtitleSentences(loaded.cues);
    expect(sentences.map((s) => s.cueIds)).toEqual([
      ["cue-0001", "cue-0002"],
      ["cue-0003"],
    ]);
    expectLossless(loaded.cues, sentences);
  });

  it("canonicalizes a repeated Japanese speaker's ruby rather than inventing a speaker change", async () => {
    const loaded = await loadSyntheticSrt([
      "\u202a（田中）明日は",
      "\u202a（田中(たなか)）学校へ行きます",
    ]);
    expect(loaded.cues.map((c) => c.speaker)).toEqual(["田中", "田中"]);
    const sentences = reconstructSubtitleSentences(loaded.cues);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(loaded.cues, sentences);
  });

  it.each(["（笑）", "（電話の呼び出し音）", "（マウスをたたく音）", "（ドアが開く）", "（笑いながら）", "(whispering)"])(
    "does not classify the sound/action annotation %s as a speaker",
    (annotation) => {
      expect(extractSpeaker(`${annotation}続けます`).speaker).toBeNull();
    },
  );

  it("remembers the active speaker across unlabelled continuation cues", () => {
    const cues = [
      cue(0, "この件は", "A"),
      cue(1, "事情が複雑なので"),
      cue(2, "分かりました。", "B"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map((s) => s.cueIds)).toEqual([
      ["cue-1", "cue-2"],
      ["cue-3"],
    ]);
    expectLossless(cues, sentences);
  });

  it("separates unpunctuated complete Japanese statements instead of waiting for a length limit", () => {
    const cues = [cue(0, "予算が減りました"), cue(1, "必要な作業です")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map((s) => s.cueIds)).toEqual([["cue-1"], ["cue-2"]]);
    expect(sentences.every((s) => !s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each(["うるさい", "楽しい", "美しい", "小さい", "必要です", "伝えてください", "そうだったな"])(
    "does not mark the complete final Japanese response %s as truncated solely because of EOF",
    (text) => {
      const cues = [cue(0, text)];
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences).toHaveLength(1);
      expect(sentences[0]?.needsReview).toBe(false);
      expectLossless(cues, sentences);
    },
  );

  it.each(["明日は", "雨が降るので", "確認してもらい", "「終わりました", "明日は...", "確認してもらい..."])(
    "keeps the genuinely unfinished final fragment %s under review",
    (text) => {
      const cues = [cue(0, text)];
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences).toHaveLength(1);
      expect(sentences[0]?.needsReview).toBe(true);
      expectLossless(cues, sentences);
    },
  );

  it("ignores closing quotation/direction controls for punctuation detection but preserves them in text", () => {
    const cues = [cue(0, "「大丈夫。」\u202c"), cue(1, "次へ進みます。")];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]?.text).toBe("「大丈夫。」\u202c");
    expect(sentences.every((s) => !s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it.each([
    ["明日行く", "予定です"],
    ["来週は行きます", "と言っていました"],
    ["資料を確認しました", "ので、共有します"],
    ["詳細を説明します", "が、少し時間がかかります"],
    ["「資料を送ります。」", "と伝えてください"],
  ])("retains the cross-cue continuation %s / %s", (first, second) => {
    const cues = [cue(0, first), cue(1, second)];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(cues, sentences);
  });

  it.each([
    ["説明します", "時間がありません"],
    ["説明は終わりました。", "予定を確認します。"],
    ["説明は終わりました。", "なら、次へ進みます。"],
  ])("does not confuse a new sentence with a noun/connective prefix: %s / %s", (first, second) => {
    const cues = [cue(0, first), cue(1, second)];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences).toHaveLength(2);
    expect(sentences.every(s => !s.needsReview)).toBe(true);
    expectLossless(cues, sentences);
  });

  it("retains a connected reason/benefactive/condition/request chain whose visible length fits the safety budget", async () => {
    const clauses = [
      "先生が",
      "講師の山田さんとよく話すので",
      "まず、山田さんから",
      "資料の準備が遅れたという話を伝えてもらい",
      "さらに担当者に作業が重なっているという情報を",
      "こちらから連絡してもらうので",
      "明日の午後、別の担当者から相談という形で",
      "期限の変更をお願いすれば、通ると伝えてください",
    ];
    const texts = clauses.map((clause) => "\u202a".repeat(8) + clause);
    expect(clauses.join("").length).toBeLessThan(180);
    expect(texts.join("").length).toBeGreaterThan(180);
    const loaded = await loadSyntheticSrt(texts);
    expect(loaded.cues.map((c) => c.text)).toEqual(texts);
    const sentences = reconstructSubtitleSentences(loaded.cues);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.needsReview).toBe(false);
    expectLossless(loaded.cues, sentences);
  });

  it("keeps uncertain and forced-overlong groups under review instead of clearing every final flag", () => {
    for (const text of ["あ".repeat(220), `${"あ".repeat(1000)}です`]) {
      const cues = [cue(0, text)];
      const sentences = reconstructSubtitleSentences(cues);
      expect(sentences.some((s) => s.needsReview)).toBe(true);
      expectLossless(cues, sentences);
    }
  });

  it("preserves multilingual word joining, cue coverage, timestamps and adjacent links", () => {
    const cues = [
      cue(0, "This is", null, "en"),
      cue(1, "a test.", null, "en"),
      cue(2, "次の説明です"),
      cue(3, "请稍等。", null, "zh"),
      cue(4, "Ready?", null, "en"),
    ];
    const sentences = reconstructSubtitleSentences(cues);
    expect(sentences.map((s) => s.text)).toEqual([
      "This is a test.",
      "次の説明です",
      "请稍等。",
      "Ready?",
    ]);
    expectLossless(cues, sentences);
  });
});
