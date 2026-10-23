#!/usr/bin/env node

import { Command, InvalidArgumentError, Option } from "commander";
import {
  createGrammarAnalyzer,
  finalizeHostGrammarAnalysis,
  generateGrammarReport,
  prepareHostGrammarAnalysis,
  type AnalysisProvider,
  type GrammarAnalyzer,
} from "@mvl/grammar-report-core";
import { ConsoleLogger, InputError, toAppError } from "@mvl/shared";

interface GlobalOptions {
  jsonLogs?: boolean;
  debug?: boolean;
}

interface GrammarCliOptions extends GlobalOptions {
  input?: string;
  text?: string;
  output?: string;
  explanationLanguage: "zh-CN" | "ja-JP" | "en";
  analysisProvider: AnalysisProvider;
  model?: string;
  prepareHost?: boolean;
  finalizeHost?: boolean;
  hostResponse?: string;
  batchSize: number;
  maxRetries: number;
  pauseThresholdSeconds: number;
  overwrite?: boolean;
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError("Expected a non-negative integer.");
  }
  return parsed;
}

function positiveOneBasedInteger(value: string): number {
  const parsed = positiveInteger(value);
  if (parsed === 0)
    throw new InvalidArgumentError("Expected an integer greater than zero.");
  return parsed;
}

function grammarAnalyzer(
  provider: AnalysisProvider,
  model: string | undefined,
): GrammarAnalyzer {
  return createGrammarAnalyzer({
    provider,
    ...(model === undefined ? {} : { model }),
  });
}

const program = new Command()
  .name("multilingual-grammar-report")
  .description(
    "Generate validated multilingual grammar reports from text or subtitles",
  )
  .version("0.1.0")
  .showHelpAfterError()
  .option("--json-logs", "emit newline-delimited JSON logs")
  .option("--debug", "include debug logs");

program
  .command("grammar-report")
  .description("Generate a validated multilingual grammar report")
  .option("--input <path>", "SRT, VTT, ASS, SSA, TXT, or subtitle-package JSON")
  .option("--text <text>", "direct text input")
  .option("--output <directory>", "report output directory")
  .addOption(
    new Option(
      "--explanation-language <language>",
      "report explanation language",
    )
      .choices(["zh-CN", "ja-JP", "en"])
      .default("zh-CN"),
  )
  .addOption(
    new Option("--analysis-provider <provider>", "analysis adapter")
      .choices(["host", "openai", "mock"])
      .default("host"),
  )
  .option("--model <model>", "grammar analysis model")
  .option(
    "--prepare-host",
    "prepare host-analysis-request.json without calling a model",
  )
  .option("--finalize-host", "validate a Host response and finish the report")
  .option(
    "--host-response <path>",
    "Host-produced response JSON; defaults inside --output",
  )
  .option(
    "--batch-size <number>",
    "sentences per analysis batch",
    positiveOneBasedInteger,
    8,
  )
  .option(
    "--max-retries <number>",
    "retries for unfinished batches",
    positiveInteger,
    2,
  )
  .option(
    "--pause-threshold-seconds <seconds>",
    "subtitle pause that closes a reconstructed sentence",
    Number,
    1.2,
  )
  .option("--overwrite", "replace files inside the selected report directory")
  .action(async (options: GrammarCliOptions, command: Command) => {
    const globals = command.optsWithGlobals<GlobalOptions>();
    const logger = new ConsoleLogger(
      globals.jsonLogs ?? false,
      globals.debug === true ? "debug" : "info",
    );
    if (options.prepareHost === true && options.finalizeHost === true) {
      throw new InputError(
        "Choose exactly one Host handoff phase: --prepare-host or --finalize-host.",
      );
    }
    if (
      options.analysisProvider !== "host" &&
      (options.prepareHost === true ||
        options.finalizeHost === true ||
        options.hostResponse !== undefined)
    ) {
      throw new InputError(
        "Host handoff options require --analysis-provider host.",
      );
    }
    if (options.analysisProvider === "host") {
      if (options.prepareHost === true) {
        const prepared = await prepareHostGrammarAnalysis({
          explanationLanguage: options.explanationLanguage,
          pauseThresholdSeconds: options.pauseThresholdSeconds,
          overwrite: options.overwrite ?? false,
          ...(options.input === undefined ? {} : { inputPath: options.input }),
          ...(options.text === undefined ? {} : { text: options.text }),
          ...(options.output === undefined
            ? {}
            : { outputDirectory: options.output }),
          ...(options.model === undefined ? {} : { model: options.model }),
        });
        console.log(
          JSON.stringify(
            { ok: true, phase: "prepare-host", ...prepared },
            null,
            2,
          ),
        );
        return;
      }
      if (options.finalizeHost === true) {
        if (options.output === undefined) {
          throw new InputError(
            "--output is required when finalizing a Host handoff.",
          );
        }
        if (options.input !== undefined || options.text !== undefined) {
          throw new InputError(
            "Do not pass --input or --text to --finalize-host; use the prepared --output directory.",
          );
        }
        const result = await finalizeHostGrammarAnalysis({
          outputDirectory: options.output,
          logger,
          batchSize: options.batchSize,
          maxHostAttempts: options.maxRetries + 1,
          overwrite: options.overwrite ?? true,
          ...(options.hostResponse === undefined
            ? {}
            : { hostResponsePath: options.hostResponse }),
        });
        console.log(
          JSON.stringify(
            {
              ok: true,
              phase: "finalize-host",
              outputDirectory: result.outputDirectory,
              report: result.reportJsonPath,
              markdown: result.reportMarkdownPath,
              sentenceCount: result.report.summary.sentenceCount,
              grammarPointCount: result.report.summary.grammarPointCount,
              cacheHits: result.cacheHits,
            },
            null,
            2,
          ),
        );
        return;
      }
    }
    const analyzer = grammarAnalyzer(options.analysisProvider, options.model);
    const result = await generateGrammarReport({
      analyzer,
      logger,
      explanationLanguage: options.explanationLanguage,
      batchSize: options.batchSize,
      maxRetries: options.maxRetries,
      pauseThresholdSeconds: options.pauseThresholdSeconds,
      overwrite: options.overwrite ?? false,
      ...(options.input === undefined ? {} : { inputPath: options.input }),
      ...(options.text === undefined ? {} : { text: options.text }),
      ...(options.output === undefined
        ? {}
        : { outputDirectory: options.output }),
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          outputDirectory: result.outputDirectory,
          report: result.reportJsonPath,
          markdown: result.reportMarkdownPath,
          sentenceCount: result.report.summary.sentenceCount,
          grammarPointCount: result.report.summary.grammarPointCount,
          cacheHits: result.cacheHits,
        },
        null,
        2,
      ),
    );
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const appError = toAppError(error);
  const jsonLogs = process.argv.includes("--json-logs");
  if (jsonLogs) {
    console.error(
      JSON.stringify({
        level: "error",
        code: appError.code,
        message: appError.message,
        details: appError.details,
      }),
    );
  } else {
    console.error(`[${appError.code}] ${appError.message}`);
    if (Object.keys(appError.details).length > 0) {
      console.error(JSON.stringify(appError.details, null, 2));
    }
  }
  process.exitCode = appError.exitCode;
}
