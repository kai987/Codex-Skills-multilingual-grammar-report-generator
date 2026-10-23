import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Host provider safety boundary", () => {
  it("contains no API, Ollama, recursive Codex, or UI automation path", async () => {
    const source = await readFile(
      path.resolve("packages/grammar-report-core/src/host.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']openai["']/iu);
    expect(source).not.toMatch(
      /OPENAI_API_KEY|OLLAMA_HOST|\/api\/chat|ollama/iu,
    );
    expect(source).not.toMatch(/spawn(?:Sync)?\s*\([^)]*codex/isu);
    expect(source).not.toMatch(/playwright|puppeteer|ChatGPT UI/iu);
  });
});
