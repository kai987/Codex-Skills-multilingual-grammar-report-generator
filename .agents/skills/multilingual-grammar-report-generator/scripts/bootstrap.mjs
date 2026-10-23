#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const runtimeRoot = fileURLToPath(new URL("../runtime/", import.meta.url));
const NPM_VERSION = "11.18.0";
const SETUP_VERSION = 1;

export function assertNodeVersion(version = process.versions.node) {
  if (Number(version.split(".")[0]) !== 24) {
    throw new Error(
      `Node.js 24 is required (current: ${version}). Install Node.js 24 with npm, then rerun using its node executable. No global packages are installed by this skill.`,
    );
  }
}

export function nodeEnvironment(nodeExecutable, environment = process.env) {
  const result = { ...environment };
  const pathKey = Object.keys(result).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const searchPath = result[pathKey] ?? "";
  for (const key of Object.keys(result)) {
    if (key.toUpperCase() === "PATH") delete result[key];
  }
  result[pathKey] = `${path.dirname(nodeExecutable)}${path.delimiter}${searchPath}`;
  return result;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function writeState(root, state) {
  const destination = path.join(root, ".runtime-state.json");
  const temporary = path.join(root, `.runtime-state.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, destination);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function staleOwner(ownerPath) {
  const owner = await readJson(ownerPath);
  return Number.isInteger(owner?.pid) && owner.pid > 0 && !processIsAlive(owner.pid);
}

async function retireStaleLock(lock) {
  // Serialize recovery independently of the former owner. In particular,
  // recheck ownership after claiming the guard: another waiter may already
  // have replaced the dead owner's directory with a live lock.
  // This companion directory is never removed by another recovery attempt.
  // Keeping it outside `lock` makes it stable while that lock is retired.
  const guard = `${lock}.recovery`;
  const guardOwnerPath = path.join(guard, "owner.json");
  try {
    await mkdir(guard);
  } catch (error) {
    if (error.code === "EEXIST" || error.code === "ENOENT") return false;
    throw error;
  }
  try {
    await writeFile(guardOwnerPath, JSON.stringify({ pid: process.pid }));
    if (!await staleOwner(path.join(lock, "owner.json"))) return false;
    const retired = `${lock}.stale.${randomUUID()}`;
    await rename(lock, retired);
    await rm(retired, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  } finally {
    await rm(guard, { recursive: true, force: true });
  }
}

// All projects share one installed skill. Serialize its first-use setup, and
// recover locks left by an interrupted setup without touching project files.
export async function withRuntimeLock(root, action, options = {}) {
  const lock = path.join(root, options.name ?? ".setup-lock");
  const ownerPath = path.join(lock, "owner.json");
  const token = randomUUID();
  const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000);
  await mkdir(root, { recursive: true });
  while (true) {
    try {
      await mkdir(lock);
      await writeFile(ownerPath, JSON.stringify({ pid: process.pid, token }));
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (await staleOwner(ownerPath) && await retireStaleLock(lock)) continue;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for skill setup at ${lock}. Let the other setup finish. If setup was interrupted and no setup is running, remove the stale lock directory and its ${lock}.recovery companion, then rerun.`);
      }
      await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 200));
    }
  }
  try {
    return await action();
  } finally {
    const owner = await readJson(ownerPath);
    if (owner?.token === token) await rm(lock, { recursive: true, force: true });
  }
}

export function runCommand(executable, argumentsList, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argumentsList, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Skill setup failed (${signal ?? `exit ${code ?? 1}`}). Rerun to retry.`));
    });
  });
}

async function sourceFiles(directory, relative = "") {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    if (["node_modules", "dist", ".venv-sudachi", ".setup-lock", ".readings-lock"].includes(entry.name)) continue;
    const candidate = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(directory, candidate));
    else if (entry.isFile() && /\.(?:ts|json|py|txt)$/.test(entry.name)) files.push(candidate);
  }
  return files.sort();
}

async function fingerprint(root, files, prefix) {
  const hash = createHash("sha256").update(prefix);
  for (const file of files) {
    hash.update(`\0${file}\0`).update(await readFile(path.join(root, file)));
  }
  return hash.digest("hex");
}

async function npmCli(nodeExecutable, environment) {
  const nodeDirectory = path.dirname(nodeExecutable);
  const pathKey = Object.keys(environment).find((key) => key.toUpperCase() === "PATH");
  const candidates = [
    path.join(nodeDirectory, "../lib/node_modules/npm/bin/npm-cli.js"),
    path.join(nodeDirectory, "node_modules/npm/bin/npm-cli.js"),
    ...((environment[pathKey] ?? "").split(path.delimiter).map((directory) => path.join(directory, "npm"))),
  ];
  for (const candidate of candidates) {
    const resolved = await realpath(candidate).catch(() => undefined);
    if (resolved !== undefined && path.basename(resolved) === "npm-cli.js") return resolved;
  }
  throw new Error("npm is required for first-use dependency setup. Install a Node.js 24 distribution that includes npm, then rerun.");
}

export async function ensureNodeRuntime(options = {}) {
  const root = options.runtimeRoot ?? runtimeRoot;
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const environment = nodeEnvironment(nodeExecutable, options.environment ?? process.env);
  const execute = options.runCommand ?? runCommand;
  assertNodeVersion(nodeVersion);

  return withRuntimeLock(root, async () => {
    const trees = ["apps", "packages", "schemas", "scripts"];
    const files = (await Promise.all(trees.map((tree) => sourceFiles(root, tree)))).flat();
    files.push(...(await readdir(root)).filter((name) => /^(?:package(?:-lock)?\.json|tsconfig(?:\.[^.]+)?\.json)$/.test(name)));
    files.sort();
    const packageFiles = files.filter((file) => path.basename(file) === "package.json" || file === "package-lock.json");
    const dependencyHash = await fingerprint(root, packageFiles, `${SETUP_VERSION}:${NPM_VERSION}:24:${process.platform}:${process.arch}`);
    const buildHash = await fingerprint(root, files, dependencyHash);
    const state = await readJson(path.join(root, ".runtime-state.json"));
    const packageData = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const dependencies = Object.keys({ ...packageData.dependencies, ...packageData.devDependencies });
    const packageNames = await Promise.all(packageFiles.filter((file) => file !== "package-lock.json").map(async (file) => JSON.parse(await readFile(path.join(root, file), "utf8")).name));
    const dependencyAssets = [...dependencies, ...packageNames.filter((name) => name !== packageData.name)].map((name) => path.join(root, "node_modules", name, "package.json"));
    dependencyAssets.push(path.join(root, "node_modules/.package-lock.json"));
    const dependenciesReady = (await Promise.all(dependencyAssets.map(exists))).every(Boolean);
    const buildAssets = files.filter((file) => file.includes(`${path.sep}src${path.sep}`) && file.endsWith(".ts")).flatMap((file) => {
      const stem = file.replace(`${path.sep}src${path.sep}`, `${path.sep}dist${path.sep}`).slice(0, -3);
      return [path.join(root, `${stem}.js`), path.join(root, `${stem}.d.ts`)];
    });
    const cliPath = path.join(root, "apps/cli/dist/index.js");
    buildAssets.push(cliPath);

    let dependenciesChanged = false;
    if (state?.dependencyHash !== dependencyHash || !dependenciesReady) {
      console.error(`Preparing skill dependencies (npm ${NPM_VERSION}, local to the installed skill)...`);
      await execute(nodeExecutable, [
        await npmCli(nodeExecutable, environment),
        "exec", "--yes", `--package=npm@${NPM_VERSION}`, "--",
        "npm", "ci", "--include=dev", "--no-audit", "--no-fund",
      ], { cwd: root, env: environment });
      dependenciesChanged = true;
      await writeState(root, { dependencyHash, buildHash: null });
    }
    if (dependenciesChanged || state?.buildHash !== buildHash || !(await Promise.all(buildAssets.map(exists))).every(Boolean)) {
      console.error("Building the installed grammar-report runtime...");
      await execute(nodeExecutable, [path.join(root, "node_modules/typescript/bin/tsc"), "-b", "--force"], { cwd: root, env: environment });
      if (!(await Promise.all(buildAssets.map(exists))).every(Boolean)) {
        throw new Error("The skill build completed without its required runtime files. Rerun setup to retry.");
      }
      await writeState(root, { dependencyHash, buildHash });
    }
    return { runtimeRoot: root, cliPath, environment };
  });
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await ensureNodeRuntime();
    console.log("The installed grammar-report runtime is ready.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
