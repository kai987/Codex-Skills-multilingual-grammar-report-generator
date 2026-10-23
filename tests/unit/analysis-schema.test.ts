import { analysisBatchSchema } from "@mvl/grammar-report-core";
import { describe, expect, it } from "vitest";

const point = {
  language: "ja",
  surface: "ても",
  pattern: "〜ても",
  category: "concession",
  formation: "動詞て形＋も",
  meaning: "即使……也",
  explanation: "表达让步关系。",
  nuance: null,
  context: null,
  examples: [
    {
      text: "雨が降っても、行きます。",
      reading: null,
      translation: "即使下雨也去。",
    },
  ],
  levelSystem: "JLPT",
  level: "N4",
  confidence: 0.9,
};

function batch(grammar = [point]) {
  return {
    sentences: [
      {
        sentenceId: "sentence-0001",
        reading: null,
        translation: "即使下雨也去。",
        grammar,
        vocabulary: [],
      },
    ],
  };
}

describe("Host response contract", () => {
  it("accepts one original example for every grammar point", () => {
    expect(analysisBatchSchema.safeParse(batch()).success).toBe(true);
  });
  it("rejects zero examples and multiple examples", () => {
    expect(
      analysisBatchSchema.safeParse(batch([{ ...point, examples: [] }]))
        .success,
    ).toBe(false);
    expect(
      analysisBatchSchema.safeParse(
        batch([{ ...point, examples: [...point.examples, ...point.examples] }]),
      ).success,
    ).toBe(false);
  });
  it("rejects extra properties and invalid confidence", () => {
    expect(
      analysisBatchSchema.safeParse({ ...batch(), invented: true }).success,
    ).toBe(false);
    expect(
      analysisBatchSchema.safeParse(batch([{ ...point, confidence: 1.1 }]))
        .success,
    ).toBe(false);
  });
  it("allows an honest empty grammar list", () => {
    expect(analysisBatchSchema.safeParse(batch([])).success).toBe(true);
  });
});
