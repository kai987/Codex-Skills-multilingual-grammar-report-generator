#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withRuntimeLock } from "./bootstrap.mjs";

const SUDACHI_PY_VERSION = "0.6.11";
const SUDACHI_DICTIONARY_VERSION = "20260428";
const repositoryRoot = fileURLToPath(new URL("../runtime/", import.meta.url));
const defaultSudachiEnvironment = path.join(repositoryRoot, ".venv-sudachi");
const defaultSudachiPython = path.join(
  defaultSudachiEnvironment,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const sudachiRequirements = path.join(
  repositoryRoot,
  "scripts/requirements-sudachi.txt",
);

function commandWorks(command, argumentsList) {
  const result = spawnSync(command, argumentsList, {
    shell: false,
    stdio: "ignore",
  });
  return result.status === 0;
}

function run(command, argumentsList) {
  const result = spawnSync(command, argumentsList, {
    shell: false,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${argumentsList.join(" ")} failed with exit code ${String(result.status)}.`,
    );
  }
}

function sudachiRuntimeWorks(pythonExecutable) {
  const verification = [
    "import importlib.metadata as m",
    `assert m.version("SudachiPy") == "${SUDACHI_PY_VERSION}"`,
    `assert m.version("SudachiDict-core") == "${SUDACHI_DICTIONARY_VERSION}"`,
    "from sudachipy import Dictionary",
    'assert Dictionary(dict="core").create().tokenize("物件")[0].reading_form() == "ブッケン"',
  ].join("; ");
  return commandWorks(pythonExecutable, ["-c", verification]);
}

const configured = process.env.SUDACHI_PYTHON?.trim();
const pythonExecutable =
  configured === undefined || configured === ""
    ? defaultSudachiPython
    : configured;

async function ensureSudachi() {
  if (!sudachiRuntimeWorks(pythonExecutable)) {
    if (configured !== undefined && configured !== "") {
      throw new Error(
        `SUDACHI_PYTHON does not provide the pinned Sudachi runtime: ${pythonExecutable}. Install ${sudachiRequirements} into that environment or remove the override.`,
      );
    }
    if (!commandWorks("python3", ["--version"])) {
      throw new Error(
        "Python 3 is required for deterministic Japanese readings. Install Python 3 and rerun this command.",
      );
    }
    if (!commandWorks(defaultSudachiPython, ["--version"])) {
      console.log(`Creating the local Sudachi environment at ${defaultSudachiEnvironment}.`);
      run("python3", ["-m", "venv", defaultSudachiEnvironment]);
    }
    console.log(`Installing pinned SudachiPy ${SUDACHI_PY_VERSION} and core dictionary ${SUDACHI_DICTIONARY_VERSION}.`);
    run(defaultSudachiPython, [
      "-m", "pip", "install", "--disable-pip-version-check", "--requirement", sudachiRequirements,
    ]);
    if (!sudachiRuntimeWorks(defaultSudachiPython)) {
      throw new Error("The pinned Sudachi runtime failed its reading self-check.");
    }
  }
  console.log(`Japanese reading enrichment is ready: SudachiPy ${SUDACHI_PY_VERSION} / core ${SUDACHI_DICTIONARY_VERSION}.`);
}

try {
  await withRuntimeLock(repositoryRoot, ensureSudachi, { name: ".readings-lock" });
} catch (error) {
  console.error(error.message);
  process.exitCode = 4;
}
