import {
  createGrammarAnalyzer,
  MockGrammarAnalyzer,
  OpenAIGrammarAnalyzer,
  type ReconstructedSentence,
} from "@mvl/grammar-report-core";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("grammar analysis provider selection", () => {
  it("requires a real Host handoff instead of simulating Host in Node", () => {
    expect(() => createGrammarAnalyzer({ provider: "host" })).toThrow(
      expect.objectContaining({ code: "HOST_CONTEXT_REQUIRED" }),
    );
  });

  it("uses OpenAI only after explicit selection and reports a missing key", () => {
    expect(() =>
      createGrammarAnalyzer({ provider: "openai", apiKey: "" }),
    ).toThrow(expect.objectContaining({ code: "MISSING_OPENAI_API_KEY" }));
  });

  it("uses Responses structured output after explicit OpenAI selection", async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        if (typeof init?.body !== "string") {
          throw new TypeError("Expected an OpenAI JSON request body.");
        }
        requestBody = JSON.parse(init.body) as Record<string, unknown>;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "resp_test",
              object: "response",
              created_at: 1,
              status: "completed",
              error: null,
              incomplete_details: null,
              instructions: null,
              max_output_tokens: null,
              model: "test-openai-model",
              output: [
                {
                  id: "msg_test",
                  type: "message",
                  status: "completed",
                  role: "assistant",
                  content: [
                    {
                      type: "output_text",
                      annotations: [],
                      logprobs: [],
                      text: JSON.stringify({
                        sentences: [
                          {
                            sentenceId: "sentence-0001",
                            reading: null,
                            translation: "我会留下。",
                            grammar: [],
                            vocabulary: [],
                          },
                        ],
                      }),
                    },
                  ],
                },
              ],
              parallel_tool_calls: true,
              previous_response_id: null,
              reasoning: { effort: null, summary: null },
              store: false,
              temperature: 1,
              text: { format: { type: "json_schema" } },
              tool_choice: "auto",
              tools: [],
              top_p: 1,
              truncation: "disabled",
              usage: {
                input_tokens: 1,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens: 1,
                output_tokens_details: { reasoning_tokens: 0 },
                total_tokens: 2,
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }),
    );
    const sentence: ReconstructedSentence = {
      id: "sentence-0001",
      cueIds: [],
      start: null,
      end: null,
      language: "en",
      languages: ["en"],
      text: "I will stay.",
      previousSentenceId: null,
      nextSentenceId: null,
      reconstructionConfidence: 1,
      needsReview: false,
    };
    const analyzer = new OpenAIGrammarAnalyzer({
      apiKey: "test-key",
      model: "test-openai-model",
      readingEnricher: null,
    });
    await expect(analyzer.analyze([sentence], "zh-CN")).resolves.toEqual([
      expect.objectContaining({ sentenceId: "sentence-0001" }),
    ]);
    expect(requestBody).toMatchObject({
      model: "test-openai-model",
      text: {
        format: {
          type: "json_schema",
          strict: true,
        },
      },
    });
  });

  it("keeps mock deterministic and explicitly test-only", () => {
    const analyzer = createGrammarAnalyzer({ provider: "mock" });
    expect(analyzer).toBeInstanceOf(MockGrammarAnalyzer);
    expect(analyzer).toMatchObject({
      provider: "mock",
      model: "deterministic-test-analyzer",
      configurationDetails: { testOnly: true },
    });
  });
});
