import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const recoveryRace = vi.hoisted(() => ({
  enabled: false,
  staleReads: 0,
  retirements: 0,
  releaseStaleReaders: undefined as (() => void) | undefined,
  staleReadersReady: undefined as Promise<void> | undefined,
  firstActionEntered: undefined as Promise<void> | undefined,
}));

// Force both contenders to observe the same dead owner. For the unfixed
// implementation, delay its second retirement until the replacement lock is
// already running an action, making the lost-lock bug deterministic.
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    readFile: async (...argumentsList: Parameters<typeof original.readFile>) => {
      const result = await original.readFile(...argumentsList);
      if (recoveryRace.enabled && String(argumentsList[0]).endsWith(`${path.sep}.setup-lock${path.sep}owner.json`)
        && String(result).includes('"pid":2147483647') && recoveryRace.staleReads < 2) {
        recoveryRace.staleReads += 1;
        if (recoveryRace.staleReads === 2) recoveryRace.releaseStaleReaders?.();
        await recoveryRace.staleReadersReady;
      }
      return result;
    },
    rename: async (...argumentsList: Parameters<typeof original.rename>) => {
      if (recoveryRace.enabled && String(argumentsList[0]).endsWith(`${path.sep}.setup-lock`)) {
        recoveryRace.retirements += 1;
        if (recoveryRace.retirements === 2) await recoveryRace.firstActionEntered;
      }
      return original.rename(...argumentsList);
    },
  };
});

const bootstrapUrl = pathToFileURL(
  fileURLToPath(new URL("../../../scripts/bootstrap.mjs", import.meta.url)),
).href;
const { assertNodeVersion, ensureNodeRuntime, nodeEnvironment, withRuntimeLock } = await import(bootstrapUrl);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  recoveryRace.enabled = false;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "grammar-bootstrap-"));
  temporaryDirectories.push(directory);
  const root = path.join(directory, "installed-skill/runtime");
  const nodeExecutable = path.join(directory, "node24/bin/node");
  const npmCli = path.join(directory, "node24/lib/node_modules/npm/bin/npm-cli.js");
  for (const entry of ["apps/cli/src", "packages/shared/src", "schemas", "scripts"]) {
    await mkdir(path.join(root, entry), { recursive: true });
  }
  await mkdir(path.dirname(npmCli), { recursive: true });
  await writeFile(npmCli, "// fixture npm CLI\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "test-runtime", dependencies: { zod: "1.0.0" }, devDependencies: { typescript: "1.0.0" },
  }));
  await writeFile(path.join(root, "package-lock.json"), "{}\n");
  await writeFile(path.join(root, "tsconfig.json"), "{}\n");
  await writeFile(path.join(root, "apps/cli/package.json"), '{"name":"@mvl/cli"}\n');
  await writeFile(path.join(root, "packages/shared/package.json"), '{"name":"@mvl/shared"}\n');
  await writeFile(path.join(root, "apps/cli/src/index.ts"), "export const fixture = 1;\n");
  await writeFile(path.join(root, "packages/shared/src/index.ts"), "export const shared = 1;\n");

  const calls: string[][] = [];
  let buildFailures = 0;
  const runCommand = async (executable: string, argumentsList: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
    calls.push(argumentsList);
    expect(executable).toBe(nodeExecutable);
    expect(options.cwd).toBe(root);
    expect(options.env.PATH?.split(path.delimiter)[0]).toBe(path.dirname(nodeExecutable));
    expect(options.env.EXAMPLE_CONFIG).toBe("preserved");
    if (argumentsList.includes("ci")) {
      expect(argumentsList).toContain("--package=npm@11.18.0");
      for (const name of ["zod", "typescript", "@mvl/cli", "@mvl/shared"]) {
        await mkdir(path.join(root, "node_modules", name), { recursive: true });
        await writeFile(path.join(root, "node_modules", name, "package.json"), "{}\n");
      }
      await writeFile(path.join(root, "node_modules/.package-lock.json"), "{}\n");
    } else {
      if (buildFailures > 0) {
        buildFailures -= 1;
        throw new Error("interrupted build");
      }
      for (const entry of ["apps/cli", "packages/shared"]) {
        await mkdir(path.join(root, entry, "dist"), { recursive: true });
        await writeFile(path.join(root, entry, "dist/index.js"), "export {};\n");
        await writeFile(path.join(root, entry, "dist/index.d.ts"), "export {};\n");
      }
    }
  };
  return {
    root, nodeExecutable, calls,
    failNextBuild() { buildFailures += 1; },
    options: { runtimeRoot: root, nodeExecutable, nodeVersion: "24.1.0", environment: { PATH: "/old-node/bin", EXAMPLE_CONFIG: "preserved" }, runCommand },
  };
}

describe("standalone skill bootstrap", () => {
  it("requires Node 24 and keeps child commands on that Node", () => {
    expect(() => assertNodeVersion("23.7.0")).toThrow(/Node.js 24 is required/);
    expect(() => assertNodeVersion("24.1.0")).not.toThrow();
    const environment = nodeEnvironment("/toolchain/node24/bin/node", { Path: "/older/bin", SAMPLE: "same" });
    expect(environment.Path).toBe(`/toolchain/node24/bin${path.delimiter}/older/bin`);
    expect(environment.SAMPLE).toBe("same");
    expect(Object.keys(environment).filter((key) => key.toUpperCase() === "PATH")).toHaveLength(1);
  });

  it("reuses setup, rebuilding for source/output changes and reinstalling for lock/dependency changes", async () => {
    const item = await fixture();
    const ready = await ensureNodeRuntime(item.options);
    expect(ready.cliPath).toBe(path.join(item.root, "apps/cli/dist/index.js"));
    expect(item.calls).toHaveLength(2);
    await ensureNodeRuntime(item.options);
    expect(item.calls).toHaveLength(2);

    await writeFile(path.join(item.root, "packages/shared/src/index.ts"), "export const shared = 2;\n");
    await ensureNodeRuntime(item.options);
    expect(item.calls).toHaveLength(3);
    expect(item.calls.at(-1)).toContain("--force");
    await rm(path.join(item.root, "packages/shared/dist/index.js"));
    await ensureNodeRuntime(item.options);
    expect(item.calls).toHaveLength(4);
    await writeFile(path.join(item.root, "package-lock.json"), '{"changed":true}\n');
    await ensureNodeRuntime(item.options);
    expect(item.calls).toHaveLength(6);
    await rm(path.join(item.root, "node_modules/zod/package.json"));
    await ensureNodeRuntime(item.options);
    expect(item.calls).toHaveLength(8);
  });

  it("retries an interrupted build without reinstalling successful dependencies", async () => {
    const item = await fixture();
    item.failNextBuild();
    await expect(ensureNodeRuntime(item.options)).rejects.toThrow("interrupted build");
    expect(JSON.parse(await readFile(path.join(item.root, ".runtime-state.json"), "utf8")).buildHash).toBeNull();
    await ensureNodeRuntime(item.options);
    expect(item.calls).toHaveLength(3);
    expect(item.calls.filter((argumentsList) => argumentsList.includes("ci"))).toHaveLength(1);
  });

  it("serializes simultaneous first use from multiple projects", async () => {
    const item = await fixture();
    await Promise.all([ensureNodeRuntime(item.options), ensureNodeRuntime(item.options)]);
    expect(item.calls).toHaveLength(2);
  });

  it("recovers a dead setup owner and bounds waits for a live owner", async () => {
    const item = await fixture();
    const lock = path.join(item.root, ".setup-lock");
    await mkdir(lock);
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, token: "aborted" }));
    await expect(withRuntimeLock(item.root, async () => "recovered")).resolves.toBe("recovered");
    await mkdir(lock);
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, token: "active" }));
    await expect(withRuntimeLock(item.root, async () => "unexpected", { timeoutMs: 10, pollMs: 5 })).rejects.toThrow(/Timed out waiting/);
  });

  it("does not retire a new live lock when two waiters saw its dead predecessor", async () => {
    const item = await fixture();
    const lock = path.join(item.root, ".setup-lock");
    await mkdir(lock);
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, token: "aborted" }));
    recoveryRace.staleReads = 0;
    recoveryRace.retirements = 0;
    recoveryRace.staleReadersReady = new Promise<void>((resolve) => { recoveryRace.releaseStaleReaders = resolve; });
    let markFirstActionEntered: () => void = () => undefined;
    recoveryRace.firstActionEntered = new Promise<void>((resolve) => { markFirstActionEntered = resolve; });
    recoveryRace.enabled = true;
    let activeActions = 0;
    let maximumActiveActions = 0;
    let actions = 0;
    const action = async () => {
      activeActions += 1;
      maximumActiveActions = Math.max(maximumActiveActions, activeActions);
      actions += 1;
      markFirstActionEntered();
      await new Promise((resolve) => setTimeout(resolve, 50));
      activeActions -= 1;
    };
    await Promise.all([
      withRuntimeLock(item.root, action, { pollMs: 2 }),
      withRuntimeLock(item.root, action, { pollMs: 2 }),
    ]);
    expect(recoveryRace.staleReads).toBe(2);
    expect(recoveryRace.retirements).toBe(1);
    expect(actions).toBe(2);
    expect(maximumActiveActions).toBe(1);
  });

  it("reports an interrupted recovery guard with an actionable bounded wait", async () => {
    const item = await fixture();
    const lock = path.join(item.root, ".setup-lock");
    await mkdir(lock);
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, token: "aborted" }));
    await mkdir(`${lock}.recovery`);
    await expect(withRuntimeLock(item.root, async () => "unexpected", { timeoutMs: 10, pollMs: 5 }))
      .rejects.toThrow(`${lock}.recovery`);
  });
});
