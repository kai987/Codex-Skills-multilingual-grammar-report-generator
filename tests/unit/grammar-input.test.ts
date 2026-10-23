import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  loadGrammarInput,
  reconstructSubtitleSentences,
  reconstructTextSentences,
} from "@mvl/grammar-report-core";
import type { SubtitleCue } from "@mvl/shared";
import { afterEach, describe, expect, it } from "vitest";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function inputFile(extension: string, content: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "grammar-input-test-"));
  temporaryPaths.push(directory);
  const filePath = path.join(directory, `synthetic.${extension}`);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("grammar input and reconstruction", () => {
  it.each([
    ["srt", "1\n00:00:01,000 --> 00:00:02,000\nこれはテストです。\n"],
    ["vtt", "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nこれはテストです。\n"],
    [
      "ass",
      "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Speaker,0,0,0,,これはテストです。\n",
    ],
    [
      "ssa",
      "[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: Marked=0,0:00:01.00,0:00:02.00,Default,Speaker,0,0,0,,これはテストです。\n",
    ],
  ])("loads synthetic %s subtitles with timing", async (extension, content) => {
    const result = await loadGrammarInput({
      inputPath: await inputFile(extension, content),
    });
    expect(result.sourceType).toBe("subtitle");
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]).toMatchObject({
      start: 1,
      end: 2,
      text: "これはテストです。",
      language: "ja",
    });
  });

  it("loads plain text and preserves separate sentence links", async () => {
    const result = await loadGrammarInput({
      inputPath: await inputFile("txt", "I will stay. You can leave."),
    });
    const sentences = reconstructTextSentences(result.text);
    expect(result.sourceType).toBe("text");
    expect(sentences).toHaveLength(2);
    expect(sentences[0]?.nextSentenceId).toBe(sentences[1]?.id);
    expect(sentences[1]?.previousSentenceId).toBe(sentences[0]?.id);
    expect(sentences.every((sentence) => sentence.start === null)).toBe(true);
  });

  it("joins Japanese cue boundaries and retains cue IDs", () => {
    const cues: SubtitleCue[] = [
      {
        id: "cue-1",
        start: 0,
        end: 0.8,
        language: "ja",
        languages: ["ja"],
        text: "明日は",
        speaker: "A",
        confidence: 0.9,
      },
      {
        id: "cue-2",
        start: 0.9,
        end: 1.8,
        language: "ja",
        languages: ["ja"],
        text: "学校へ行きます。",
        speaker: "A",
        confidence: 0.9,
      },
    ];
    expect(reconstructSubtitleSentences(cues)).toEqual([
      expect.objectContaining({
        cueIds: ["cue-1", "cue-2"],
        text: "明日は学校へ行きます。",
        start: 0,
        end: 1.8,
        reconstructionConfidence: 0.97,
      }),
    ]);
    expect(
      reconstructSubtitleSentences([
        { ...cues[0]!, speaker: "A" },
        { ...cues[1]!, speaker: "B" },
      ]),
    ).toHaveLength(2);
  });

  it("rejects arbitrary JSON and unsupported file types", async () => {
    await expect(
      loadGrammarInput({
        inputPath: await inputFile("json", '{"text":"hello"}'),
      }),
    ).rejects.toThrow(/arbitrary objects are rejected/u);
    await expect(
      loadGrammarInput({ inputPath: await inputFile("csv", "hello") }),
    ).rejects.toThrow(/Unsupported grammar input format/u);
  });

  it("loads a validated subtitle package without needing the source video", async () => {
    const syntheticPackage = {
      schemaVersion: "1.0.0",
      packageType: "multilingual-subtitle-package",
      status: "ready",
      sourceLanguage: "ja",
      detectedLanguages: ["ja"],
      source: {
        fileName: "synthetic.mp4",
        container: "mp4",
        durationSeconds: 2,
      },
      identity: {
        title: "合成テスト",
        season: null,
        episode: null,
        year: null,
      },
      primarySubtitle: {
        language: "ja",
        sourceType: "embedded",
        validationStatus: "validated",
        streamIndex: 0,
      },
      subtitleFiles: { srt: null, vtt: null, ass: null },
      referenceSubtitles: [],
      video: { sourcePath: null, subtitledPath: null },
      warnings: [],
      cues: [
        {
          id: "cue-1",
          start: 1,
          end: 2,
          language: "ja",
          languages: ["ja"],
          text: "これはテストです。",
          speaker: null,
          confidence: 1,
        },
      ],
      transcription: {
        provider: "synthetic-test-only",
        strategy: "adaptive",
        qualitySummary: { accepted: 1, refined: 0, needsHumanReview: 0 },
      },
    };
    const loaded = await loadGrammarInput({
      inputPath: await inputFile("json", JSON.stringify(syntheticPackage)),
    });
    expect(loaded).toMatchObject({
      sourceType: "subtitle-package",
      title: "合成テスト",
    });
    expect(loaded.cues).toHaveLength(1);
  });

  it("requires exactly one input source", async () => {
    await expect(loadGrammarInput({})).rejects.toThrow(/exactly one/u);
    await expect(
      loadGrammarInput({ text: "hello", inputPath: "hello.txt" }),
    ).rejects.toThrow(/exactly one/u);
  });
});
