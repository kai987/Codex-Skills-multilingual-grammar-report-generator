import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  generateGrammarReport,
  MockGrammarAnalyzer,
  OpenAIGrammarAnalyzer,
} from "@mvl/grammar-report-core";
import { grammarReportSchema, MemoryLogger } from "@mvl/shared";
import { afterAll, describe, expect, it } from "vitest";

let temporaryRoot = "";

afterAll(async () => {
  if (temporaryRoot !== "")
    await rm(temporaryRoot, { recursive: true, force: true });
});

describe("grammar report workflow", () => {
  it("writes schema-valid JSON and Markdown and reuses sentence caches", async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "mvl-grammar-report-"));
    const analyzer = new MockGrammarAnalyzer();
    const fixedNow = () => new Date("2026-07-22T00:00:00.000Z");
    const options = {
      inputPath: path.resolve("tests/fixtures/sample-mixed.srt"),
      outputDirectory: temporaryRoot,
      analyzer,
      logger: new MemoryLogger(),
      now: fixedNow,
    };
    const first = await generateGrammarReport(options);
    expect(first.report.summary.sentenceCount).toBe(2);
    expect(first.report.summary.grammarPointCount).toBe(4);
    expect(
      first.report.sentences.flatMap((sentence) =>
        sentence.grammar.map((grammar) => grammar.levelSystem),
      ),
    ).toEqual(["HSK", "CEFR", "JLPT", "CEFR"]);
    expect(
      first.report.sentences.every((sentence) =>
        sentence.grammar.every((grammar) => grammar.examples.length === 1),
      ),
    ).toBe(true);
    const onDisk = grammarReportSchema.parse(
      JSON.parse(await readFile(first.reportJsonPath, "utf8")),
    );
    expect(onDisk.reportType).toBe("multilingual-grammar-report");
    const markdown = await readFile(first.reportMarkdownPath, "utf8");
    expect(markdown).toContain("# Multilingual grammar report");
    expect(markdown).toContain("Example:");
    expect(markdown).toContain("Example translation:");
    const secondAnalyzer = new MockGrammarAnalyzer();
    const second = await generateGrammarReport({
      ...options,
      analyzer: secondAnalyzer,
      overwrite: true,
    });
    expect(second.cacheHits).toBe(2);
    expect(second.analyzedSentences).toBe(0);
    expect(secondAnalyzer.calls).toBe(0);
  });

  it("reports a missing OpenAI API key before analysis begins", () => {
    expect(() => new OpenAIGrammarAnalyzer({ apiKey: "" })).toThrow(
      /OPENAI_API_KEY/u,
    );
  });
});
