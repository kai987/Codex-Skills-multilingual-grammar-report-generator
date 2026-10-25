import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { prepareHostGrammarAnalysis } from "@mvl/grammar-report-core";
import { extractCueSpeakers, extractSpeaker } from "@mvl/subtitle-core";
import { afterEach, describe, expect, it } from "vitest";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true }),
  ));
});

interface RequestSentence {
  id: string;
  text: string;
  cueIds: string[];
  speakers: string[];
}

async function prepare(extension: string, content: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "grammar-speaker-context-"));
  temporaryPaths.push(directory);
  const inputPath = path.join(directory, `synthetic.${extension}`);
  await writeFile(inputPath, content, "utf8");
  const result = await prepareHostGrammarAnalysis({
    inputPath,
    outputDirectory: path.join(directory, "report"),
    readingEnricher: null,
  });
  const request = JSON.parse(await readFile(result.requestPath, "utf8")) as {
    sentences: RequestSentence[];
  };
  const prepared = JSON.parse(await readFile(path.join(result.outputDirectory, "sentences.json"), "utf8")) as {
    sentences: Array<{ cueIds: string[]; text: string }>;
  };
  return { request, prepared };
}

describe("subtitle speaker context reaches Host handoff", () => {
  it.each([
    "くしゃみ",
    "あくび",
    "せきばらい",
    "歓声",
    "泣き声",
    "鳴き声",
    "携帯電話のバイブレーター",
    "電車の警笛",
    "拍手と歓声",
  ])("does not turn the stage direction %s into a speaker", effect => {
    const text = `\u202a（${effect}）`;
    expect(extractSpeaker(text).speaker).toBeNull();
    expect(extractCueSpeakers(text)).toEqual([]);
    expect(extractCueSpeakers(`${text}\n続けます。`)).toEqual([]);
  });

  it("finds a person after a leading sound direction without returning the direction itself", () => {
    const text = "\u202a（くしゃみ）\n\u202a（山田(やまだ)）大丈夫ですか？";
    expect(extractCueSpeakers(text)).toEqual(["山田"]);
  });

  it("retains both explicit speakers of a native dual-person cue in source order", () => {
    const text = "\u202a-（山田(やまだ)）準備は？\n\u202a-（田中）はい";
    expect(extractCueSpeakers(text)).toEqual(["山田", "田中"]);
  });

  it("deduplicates a person's metadata and repeated inline ruby variants", () => {
    const text = "（山田）説明します\n（山田(やまだ)）続けます";
    expect(extractCueSpeakers(text, "山田")).toEqual(["山田"]);
  });

  it("preserves a trusted source speaker when the cue contains only an action direction and unlabelled speech", () => {
    expect(extractCueSpeakers("（くしゃみ）\n説明します。", "RecordedSpeaker")).toEqual(["RecordedSpeaker"]);
  });

  it("does not infer an unlabelled cue's speaker from the preceding cue", () => {
    expect(extractCueSpeakers("続けます。", null)).toEqual([]);
  });

  it("does not treat a parenthetical noun inside ordinary dialogue as a speaker label", () => {
    expect(extractCueSpeakers("手順（確認）を説明します。")).toEqual([]);
  });

  it("hands off every explicit person after leading effects and isolates a dual-person cue from an unlabelled continuation", async () => {
    const texts = [
      "\u202a（くしゃみ）\n\u202a（山田(やまだ)）大丈夫ですか？",
      "\u202a-（田中）はい\n\u202a-（佐藤）そうですか",
      "\u202a業務を変えようと思っているんだけど…",
      "\u202a（携帯電話のバイブレーター）",
    ];
    const content = texts.map((text, i) =>
      `${i + 1}\n00:00:0${i * 2},000 --> 00:00:0${i * 2 + 1},000\n${text}\n`,
    ).join("\n");
    const { request, prepared } = await prepare("srt", content);
    const containing = (cueId: string) => request.sentences.find(s => s.cueIds.includes(cueId));
    expect(containing("cue-0001")?.speakers).toEqual(["山田"]);
    expect(containing("cue-0002")?.speakers).toEqual(["田中", "佐藤"]);
    expect(containing("cue-0002")?.cueIds).toEqual(["cue-0002"]);
    expect(containing("cue-0003")?.speakers).toEqual([]);
    expect(containing("cue-0004")?.speakers).toEqual([]);
    expect(request.sentences.flatMap(s => s.cueIds)).toEqual([
      "cue-0001", "cue-0002", "cue-0003", "cue-0004",
    ]);
    expect(prepared.sentences.map(s => s.text).join("")).toBe(texts.join(""));
    expect(request.sentences.flatMap(s => s.speakers)).not.toContain("くしゃみ");
    expect(request.sentences.flatMap(s => s.speakers)).not.toContain("携帯電話のバイブレーター");
  });

  it("keeps the ASS Name field as Host speaker metadata after a sound prefix", async () => {
    const ass = [
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      "Dialogue: 0,0:00:01.00,0:00:02.00,Default,RecordedSpeaker,0,0,0,,（くしゃみ）\\N説明します。",
      "",
    ].join("\n");
    const { request } = await prepare("ass", ass);
    expect(request.sentences).toHaveLength(1);
    expect(request.sentences[0]?.speakers).toEqual(["RecordedSpeaker"]);
  });

  it("keeps a validated subtitle package's explicit speaker rather than replacing it with a stage direction", async () => {
    const subtitlePackage = {
      schemaVersion: "1.0.0",
      packageType: "multilingual-subtitle-package",
      status: "ready",
      sourceLanguage: "ja",
      detectedLanguages: ["ja"],
      source: { fileName: "synthetic.mp4", container: "mp4", durationSeconds: 2 },
      identity: { title: "合成テスト", season: null, episode: null, year: null },
      primarySubtitle: {
        language: "ja", sourceType: "embedded", validationStatus: "validated", streamIndex: 0,
      },
      subtitleFiles: { srt: null, vtt: null, ass: null },
      referenceSubtitles: [],
      video: { sourcePath: null, subtitledPath: null },
      warnings: [],
      cues: [{
        id: "cue-package-1", start: 1, end: 2, language: "ja", languages: ["ja"],
        text: "（あくび）\n説明します。", speaker: "RecordedSpeaker", confidence: 1,
      }],
      transcription: {
        provider: "synthetic-test-only", strategy: "adaptive",
        qualitySummary: { accepted: 1, refined: 0, needsHumanReview: 0 },
      },
    };
    const { request } = await prepare("json", JSON.stringify(subtitlePackage));
    expect(request.sentences).toHaveLength(1);
    expect(request.sentences[0]?.speakers).toEqual(["RecordedSpeaker"]);
    expect(request.sentences[0]?.cueIds).toEqual(["cue-package-1"]);
  });
});
