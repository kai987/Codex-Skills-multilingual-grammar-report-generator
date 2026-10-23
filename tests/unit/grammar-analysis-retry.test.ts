import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  analyzeSentencesWithCache,
  type GrammarAnalyzer,
  type ReconstructedSentence,
  type SentenceAnalysis,
} from "@mvl/grammar-report-core";
import { MemoryLogger } from "@mvl/shared";
import { afterAll, describe, expect, it } from "vitest";

let temporaryRoot = "";

afterAll(async () => {
  if (temporaryRoot !== "")
    await rm(temporaryRoot, { recursive: true, force: true });
});

function sentence(id: string, text: string): ReconstructedSentence {
  return {
    id,
    cueIds: [],
    start: null,
    end: null,
    language: "en",
    languages: ["en"],
    text,
    previousSentenceId: null,
    nextSentenceId: null,
    reconstructionConfidence: 1,
    needsReview: false,
  };
}

function analysis(sentenceId: string): SentenceAnalysis {
  return {
    sentenceId,
    reading: null,
    translation: null,
    grammar: [],
    vocabulary: [],
  };
}

describe("grammar batch retry", () => {
  it("retries only omitted sentence results and preserves successful cache entries", async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "mvl-analysis-retry-"));
    const calls: string[][] = [];
    const analyzer: GrammarAnalyzer = {
      provider: "mock",
      id: "partial",
      model: "partial-v1",
      configurationHash: "partial-config-v1",
      analyze(sentences) {
        calls.push(sentences.map((item) => item.id));
        return Promise.resolve([analysis(sentences[0]?.id ?? "missing")]);
      },
    };
    const result = await analyzeSentencesWithCache({
      sentences: [sentence("s1", "Hello."), sentence("s2", "Goodbye.")],
      options: {
        analyzer,
        logger: new MemoryLogger(),
        maxRetries: 2,
      },
      cacheDirectory: temporaryRoot,
    });
    expect(result.analyses.size).toBe(2);
    expect(calls).toEqual([["s1", "s2"], ["s2"]]);
  });
});
