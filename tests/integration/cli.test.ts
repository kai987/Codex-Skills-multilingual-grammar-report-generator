import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const temporaryPaths: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function cli(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "apps/cli/src/index.ts", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, OPENAI_API_KEY: "" },
    },
  );
}

describe("standalone grammar CLI", () => {
  it("exposes grammar commands only", () => {
    const result = cli(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("grammar-report");
    expect(result.stdout).not.toContain("build-learning-site");
    expect(result.stdout).not.toContain("pipeline");
  });

  it("fails closed without a Host handoff or explicit provider", () => {
    const result = cli([
      "grammar-report",
      "--text",
      "I will stay.",
      "--json-logs",
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("HOST_CONTEXT_REQUIRED");
  });

  it.each([
    ["--analysis-provider", "mock", "--prepare-host"],
    ["--prepare-host", "--finalize-host"],
    ["--finalize-host"],
    ["--batch-size", "0"],
    ["--max-retries", "-1"],
  ])("rejects invalid options: %s %s", (...args) => {
    const result = cli(["grammar-report", ...args]);
    expect(result.status).not.toBe(0);
  });

  it("prepares a Host request with no external model or Python process", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "grammar-cli-host-"));
    temporaryPaths.push(directory);
    const result = cli([
      "grammar-report",
      "--text",
      "I will stay.",
      "--prepare-host",
      "--output",
      directory,
    ]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const request = JSON.parse(
      await readFile(
        path.join(directory, "host-analysis-request.json"),
        "utf8",
      ),
    );
    expect(request.analysisProvider).toBe("host");
    expect(request.sentences).toHaveLength(1);
  });

  it("generates a complete synthetic report with explicit mock mode", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "grammar-cli-mock-"));
    temporaryPaths.push(directory);
    const result = cli([
      "grammar-report",
      "--text",
      "I will stay.",
      "--analysis-provider",
      "mock",
      "--output",
      directory,
    ]);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(
      await readFile(path.join(directory, "grammar-report.json"), "utf8"),
    );
    expect(report.analysis.model).toBe("deterministic-test-analyzer");
    expect(report.sentences).toHaveLength(1);
  });
});
