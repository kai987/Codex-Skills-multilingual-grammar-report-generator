#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const arguments_ = process.argv.slice(2);

function optionValue(name) {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

function run(executable, argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argumentsList, {
      cwd: repositoryRoot,
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

if (provider === "openai" || (provider === "host" && isFinalizeHost)) {
  const ensureCode = await run(process.execPath, [
    fileURLToPath(new URL("./ensure-sudachi.mjs", import.meta.url)),
  ]);
  if (ensureCode !== 0) process.exit(ensureCode);
}

const code = await run("npm", ["run", "grammar-report", "--", ...arguments_]);
process.exitCode = code;
