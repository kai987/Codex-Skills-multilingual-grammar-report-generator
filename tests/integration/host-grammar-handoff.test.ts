import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  finalizeHostGrammarAnalysis,
  prepareHostGrammarAnalysis,
  type JapaneseReadingEnricher,
  type ReconstructedSentence,
  type SentenceAnalysis,
} from "@mvl/grammar-report-core";
import { grammarReportSchema, MemoryLogger } from "@mvl/shared";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

let temporaryRoot = "";

afterAll(async () => {
  if (temporaryRoot !== "")
    await rm(temporaryRoot, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function grammar(
  language: "ja" | "zh" | "en",
  levelSystem: "JLPT" | "HSK" | "CEFR",
  level: string,
) {
  return {
    language,
    surface: language === "ja" ? "ても" : language === "zh" ? "了" : "will",
    pattern:
      language === "ja"
        ? "動詞て形＋も"
        : language === "zh"
          ? "动词＋了"
          : "will + base verb",
    category:
      language === "ja" ? "concession" : language === "zh" ? "aspect" : "modal",
    formation:
      language === "ja"
        ? "動詞て形＋も"
        : language === "zh"
          ? "动词＋了"
          : "will + base verb",
    meaning:
      language === "ja"
        ? "即使……也"
        : language === "zh"
          ? "表示完成"
          : "表示将来或意愿",
    explanation: "说明该结构在当前句子中的语法作用。",
    nuance: null,
    context: null,
    examples: [
      {
        text:
          language === "ja"
            ? "雨が降っても、出かけます。"
            : language === "zh"
              ? "我已经看完了。"
              : "I will call you tomorrow.",
        reading: null,
        translation:
          language === "ja"
            ? "即使下雨也要出门。"
            : language === "zh"
              ? "我已经看完了。"
              : "我明天会给你打电话。",
      },
    ],
    levelSystem,
    level,
    confidence: 0.9,
  };
}

function analysis(
  sentenceId: string,
  language: "ja" | "zh" | "en",
): SentenceAnalysis {
  const level =
    language === "ja"
      ? (["JLPT", "N3"] as const)
      : language === "zh"
        ? (["HSK", "2"] as const)
        : (["CEFR", "A2"] as const);
  return {
    sentenceId,
    reading: language === "ja" ? "incorrect-model-reading" : null,
    translation: "测试译文",
    grammar: [grammar(language, level[0], level[1])],
    vocabulary:
      language === "ja"
        ? [
            {
              surface: "未知固有名",
              language: "ja",
              reading: "guessed-reading",
              meaning: "未知专名",
            },
          ]
        : [],
  };
}

function deterministicReadingEnricher(): JapaneseReadingEnricher {
  return {
    id: "test-sudachipy-core",
    metadata: {
      dictionary: "core",
      dictionaryVersion: "test-2026",
      oovPolicy: "null",
    },
    configurationHash: "test-sudachi-configuration-v1",
    enrich(
      sentences: readonly ReconstructedSentence[],
      analyses: readonly SentenceAnalysis[],
    ): Promise<readonly SentenceAnalysis[]> {
      const sentencesById = new Map(
        sentences.map((sentence) => [sentence.id, sentence]),
      );
      return Promise.resolve(
        analyses.map((item) =>
          sentencesById.get(item.sentenceId)?.language === "ja"
            ? {
                ...item,
                reading: "そんなこといわれてもこまるんだけど。",
                vocabulary: item.vocabulary.map((vocabulary) => ({
                  ...vocabulary,
                  reading: null,
                })),
              }
            : item,
        ),
      );
    },
  };
}

describe("Host grammar-analysis handoff", () => {
  it("prepares, validates, enriches, and finalizes without an external model call", async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "mvl-host-handoff-"));
    const outputDirectory = path.join(temporaryRoot, "complete");
    const fetchSpy = vi.fn(() => {
      throw new Error("Host mode must not make HTTP model calls.");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const readingEnricher = deterministicReadingEnricher();
    const prepared = await prepareHostGrammarAnalysis({
      text: [
        "そんなこと言われても困るんだけど。",
        "我已经看完了。",
        "I will review it.",
      ].join("\n"),
      outputDirectory,
      explanationLanguage: "zh-CN",
      readingEnricher,
    });
    const request = JSON.parse(
      await readFile(prepared.requestPath, "utf8"),
    ) as {
      analysisProvider: string;
      model: string;
      sentences: { id: string; previousText: string | null }[];
      resources: { responseSchema: string; reportContract: string };
    };
    expect(request.analysisProvider).toBe("host");
    expect(request.model).toBe("current-host-model");
    expect(request.sentences).toHaveLength(3);
    expect(request.sentences[1]?.previousText).toContain("そんなこと");
    await expect(
      readFile(request.resources.responseSchema, "utf8"),
    ).resolves.toContain('"type": "object"');
    await expect(
      readFile(request.resources.reportContract, "utf8"),
    ).resolves.toContain("Grammar report contract");

    await writeFile(
      prepared.responsePath,
      `${JSON.stringify(
        {
          sentences: [
            analysis("sentence-0001", "ja"),
            analysis("sentence-0002", "zh"),
            analysis("sentence-0003", "en"),
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const finalized = await finalizeHostGrammarAnalysis({
      outputDirectory,
      logger: new MemoryLogger(),
      readingEnricher,
    });
    const report = grammarReportSchema.parse(
      JSON.parse(await readFile(finalized.reportJsonPath, "utf8")),
    );
    expect(report.analysis.model).toBe("current-host-model");
    expect(report.sentences[0]?.reading).toBe(
      "そんなこといわれてもこまるんだけど。",
    );
    expect(report.sentences[0]?.vocabulary[0]?.reading).toBeNull();
    expect(
      report.sentences.map((sentence) => sentence.grammar[0]?.levelSystem),
    ).toEqual(["JLPT", "HSK", "CEFR"]);
    expect(
      report.sentences.every((sentence) =>
        sentence.grammar.every((point) => point.examples.length === 1),
      ),
    ).toBe(true);
    const manifest = JSON.parse(
      await readFile(
        path.join(outputDirectory, "analysis-manifest.json"),
        "utf8",
      ),
    ) as {
      analysisProvider: string;
      model: string;
      status: string;
      hostHandoff: { status: string };
    };
    expect(manifest).toMatchObject({
      analysisProvider: "host",
      model: "current-host-model",
      status: "completed",
      hostHandoff: { status: "completed" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    const cached = await prepareHostGrammarAnalysis({
      text: [
        "そんなこと言われても困るんだけど。",
        "我已经看完了。",
        "I will review it.",
      ].join("\n"),
      outputDirectory,
      explanationLanguage: "zh-CN",
      readingEnricher,
      overwrite: true,
    });
    expect(cached.cacheHits).toBe(3);
    expect(cached.pendingSentenceIds).toEqual([]);
  });

  it("caches valid sentences and requests only failed sentences again", async () => {
    temporaryRoot ||= await mkdtemp(
      path.join(tmpdir(), "mvl-host-handoff-retry-"),
    );
    const outputDirectory = path.join(temporaryRoot, "retry");
    const prepared = await prepareHostGrammarAnalysis({
      text: "I will stay. You can leave.",
      outputDirectory,
      explanationLanguage: "zh-CN",
      readingEnricher: null,
    });
    await writeFile(
      prepared.responsePath,
      `${JSON.stringify({
        sentences: [
          analysis("sentence-0001", "en"),
          {
            sentenceId: "sentence-0002",
            reading: null,
            translation: null,
            grammar: [{ surface: "can" }],
            vocabulary: [],
          },
        ],
      })}\n`,
      "utf8",
    );
    await expect(
      finalizeHostGrammarAnalysis({
        outputDirectory,
        readingEnricher: null,
      }),
    ).rejects.toMatchObject({
      code: "HOST_ANALYSIS_VALIDATION_FAILED",
    });
    const retryRequest = JSON.parse(
      await readFile(prepared.requestPath, "utf8"),
    ) as { attempt: number; sentences: { id: string }[] };
    expect(retryRequest.attempt).toBe(2);
    expect(retryRequest.sentences.map((sentence) => sentence.id)).toEqual([
      "sentence-0002",
    ]);
    await writeFile(
      prepared.responsePath,
      `${JSON.stringify({
        sentences: [analysis("sentence-0002", "en")],
      })}\n`,
      "utf8",
    );
    const finalized = await finalizeHostGrammarAnalysis({
      outputDirectory,
      readingEnricher: null,
    });
    expect(finalized.report.sentences).toHaveLength(2);
    expect(finalized.cacheHits).toBe(2);
    const validation = JSON.parse(
      await readFile(
        path.join(outputDirectory, "host-validation-errors.json"),
        "utf8",
      ),
    ) as { status: string; issues: unknown[] };
    expect(validation).toEqual(
      expect.objectContaining({ status: "resolved", issues: [] }),
    );
  });
});
