#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureNodeRuntime } from "./bootstrap.mjs";

const arguments_ = process.argv.slice(2);

function optionValue(name) {
  const assignment = arguments_.find((argument) => argument.startsWith(`${name}=`));
  if (assignment !== undefined) return assignment.slice(name.length + 1);
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

function run(executable, argumentsList, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argumentsList, {
      cwd: process.cwd(),
      env: environment,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const explicitProvider = optionValue("--analysis-provider");
const provider = explicitProvider ?? "host";
if (explicitProvider === undefined) {
  arguments_.push("--analysis-provider", provider);
}
const isPrepareHost = arguments_.includes("--prepare-host");
const isFinalizeHost = arguments_.includes("--finalize-host");
if (provider === "host" && !isPrepareHost && !isFinalizeHost) {
  arguments_.push("--prepare-host");
}

try {
  const { cliPath, environment } = await ensureNodeRuntime();
  const isHelp = arguments_.some((argument) => ["--help", "-h", "--version", "-V"].includes(argument));
  if (!isHelp && (provider === "openai" || (provider === "host" && isFinalizeHost))) {
    const ensureCode = await run(process.execPath, [
      fileURLToPath(new URL("./ensure-sudachi.mjs", import.meta.url)),
    ], environment);
    if (ensureCode !== 0) process.exit(ensureCode);
  }
  process.exitCode = await run(process.execPath, [cliPath, "grammar-report", ...arguments_], environment);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
