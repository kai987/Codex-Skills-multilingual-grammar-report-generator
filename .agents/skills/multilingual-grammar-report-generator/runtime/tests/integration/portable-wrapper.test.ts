import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const wrapper = fileURLToPath(new URL("../../../scripts/run.mjs", import.meta.url));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function run(cwd: string, args: string[]) {
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [wrapper, ...args], {
      cwd, env: { ...process.env, OPENAI_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

describe("installed skill from an unrelated project", () => {
  it("resolves relative input/output in the caller and links installed references", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "grammar unrelated project "));
    directories.push(project);
    await writeFile(path.join(project, "lesson.txt"), "日本語を勉強しています。", "utf8");
    const result = await run(project, ["--input", "lesson.txt", "--output", "reports/host"]);
    expect(result.code, result.stderr).toBe(0);
    const request = JSON.parse(await readFile(path.join(project, "reports/host/host-analysis-request.json"), "utf8"));
    expect(request.analysisProvider).toBe("host");
    expect(request.sentences[0].text).toBe("日本語を勉強しています。");
    await Promise.all(Object.values(request.resources).map(resource => access(String(resource))));
  }, 120_000);

  it("writes a complete mock smoke report inside the caller project", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "grammar caller smoke "));
    directories.push(project);
    const result = await run(project, ["--text", "I will stay.", "--analysis-provider", "mock", "--output", "reports/mock"]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(await readFile(path.join(project, "reports/mock/grammar-report.json"), "utf8"));
    expect(report.analysis.model).toBe("deterministic-test-analyzer");
    expect(report.sentences).toHaveLength(1);
  }, 120_000);
});
