import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  InputError,
  detectTextLanguage,
  readJson,
  subtitlePackageSchema,
  type SubtitleCue,
} from "@mvl/shared";
import {
  normalizeSubtitleCues,
  parseSubtitle,
  extractCueSpeakers,
  type SubtitleFormat,
} from "@mvl/subtitle-core";

import type { ReconstructedSentence } from "./types.js";
import { findClauseChains } from "./clause-chains.js";
import {
  continuesInNextCue,
  continuesClosedQuotation,
  hasCompleteEnding,
  hasTerminalPunctuation,
  isIncompleteEnding,
  isPostposedTail,
  isTemporalTopicContinuation,
  continuesNominalizedClause,
  hasPendingClauseBeforeFillers,
  hasOpenQuote,
  isStandaloneAcknowledgement,
  isSuspendedClause,
  isTerminalAdditiveShi,
  type DialogueBoundaryContext,
} from "./sentence-boundaries.js";

export interface LoadedGrammarInput {
  sourceType: "subtitle" | "text" | "subtitle-package";
  title: string | null;
  fileName: string | null;
  cues: SubtitleCue[];
  text: string;
}

function joinCueText(parts: readonly string[]): string {
  return parts.reduce((result, part) => {
    if (result === "") return part.trim();
    const next = part.trim();
    const needsSpace =
      /[\p{Script=Latin}\p{N}]$/u.test(result) &&
      /^[\p{Script=Latin}\p{N}]/u.test(next);
    return `${result}${needsSpace ? " " : ""}${next}`;
  }, "");
}

function finalizeLinks(
  sentences: ReconstructedSentence[],
): ReconstructedSentence[] {
  return sentences.map((sentence, index) => ({
    ...sentence,
    previousSentenceId: sentences[index - 1]?.id ?? null,
    nextSentenceId: sentences[index + 1]?.id ?? null,
  }));
}

export function reconstructSubtitleSentences(
  cues: readonly SubtitleCue[],
  pauseThresholdSeconds = 1.2,
): ReconstructedSentence[] {
  const groups: {
    cues: SubtitleCue[];
    confidence: number;
    needsReview: boolean;
  }[] = [];
  let current: SubtitleCue[] = [];
  let currentSpeaker: string | null = null;
  const speakers = cues.map(cue => extractCueSpeakers(cue.text, cue.speaker));
  const clauseChains = findClauseChains(cues, speakers, pauseThresholdSeconds);
  const speakerAt = (index: number): string | null => speakers[index]?.[0] ?? null;
  const multipleSpeakersAt = (index: number): boolean => (speakers[index]?.length ?? 0) > 1;
  const previousText = (): string | null => {
    const group = groups.at(-1);
    return group === undefined ? null : joinCueText(group.cues.map(cue => cue.text));
  };
  const previousGap = (): number => {
    const end = groups.at(-1)?.cues.at(-1)?.end;
    return end === undefined || current[0] === undefined ? Infinity : current[0].start - end;
  };
  const previousHasMultipleSpeakers = (): boolean => groups.at(-1)?.cues.some(cue =>
    (speakers[cueIndex.get(cue.id) ?? -1]?.length ?? 0) > 1,
  ) ?? false;
  const cueIndex = new Map(cues.map((cue, index) => [cue.id, index]));
  const isReply = (speaker: string | null): boolean => {
    const previous = groups.at(-1);
    if (previous === undefined || speaker === null) return false;
    const known = new Set(previous.cues.flatMap(cue => {
      const index = cueIndex.get(cue.id);
      return index === undefined ? [] : (speakers[index] ?? []);
    }));
    return known.size === 1 && !known.has(speaker);
  };
  const previousSpeakerUnknown = (speaker: string | null): boolean => {
    const previous = groups.at(-1);
    return speaker !== null && previous !== undefined && previous.cues.every(cue =>
      (speakers[cueIndex.get(cue.id) ?? -1]?.length ?? 0) === 0,
    );
  };
  const explicitNextTurn = (known: string | null, index: number): boolean =>
    !multipleSpeakersAt(index) && speakerAt(index) !== null && speakerAt(index) !== known;
  const sameSpeaker = (known: string | null, index: number): boolean =>
    !multipleSpeakersAt(index) && (speakerAt(index) === null || speakerAt(index) === known);
  const contextWindow = 3;
  const contextualLink = (text: string, knownSpeaker: string | null, index: number, previousEnd: number): boolean => {
    const next = cues[index];
    if (next === undefined || !sameSpeaker(knownSpeaker, index) || next.start - previousEnd > contextWindow) return false;
    const postposed = isPostposedTail(text, next.text);
    const topic = isTemporalTopicContinuation(text, next.text);
    if (!postposed && !topic) return false;
    // Prefer the following predicate for a prospective subject: 彼が / 来ます.
    const after = cues[index + 1];
    if (postposed && after !== undefined && sameSpeaker(speakerAt(index) ?? knownSpeaker, index + 1) &&
        after.start - next.end < pauseThresholdSeconds && hasCompleteEnding(after.text)) return false;
    return Array.from(joinCueText([text, next.text]).replace(/\p{Cf}/gu, "")).length < 180;
  };
  const flush = (confidence: number, needsReview = false): void => {
    if (current.length === 0) return;
    groups.push({ cues: current, confidence, needsReview });
    current = [];
    currentSpeaker = null;
  };
  for (const [index, cue] of cues.entries()) {
    const previous = current.at(-1);
    const speaker = speakerAt(index);
    const before = joinCueText(current.map(item => item.text));
    const attached = previous !== undefined && contextualLink(before, currentSpeaker, index, previous.end);
    const priorContext: DialogueBoundaryContext = {
      previousText: previousText(), nextText: cue.text, turnEnded: true,
      isReply: isReply(currentSpeaker), explicitNextTurn: explicitNextTurn(currentSpeaker, index),
      previousSpeakerUnknown: previousSpeakerUnknown(currentSpeaker),
      previousGapSeconds: previousGap(), nextGapSeconds: previous === undefined ? Infinity : cue.start - previous.end,
      previousHasMultipleSpeakers: previousHasMultipleSpeakers(),
    };
    if (
      previous !== undefined &&
      (multipleSpeakersAt(index) || (speaker !== null && speaker !== currentSpeaker) ||
        (isStandaloneAcknowledgement(cue.text) && isSuspendedClause(before)) ||
        (cue.start - previous.end >= pauseThresholdSeconds && !attached && !clauseChains.links.has(index - 1)))
    ) {
      const incomplete = isIncompleteEnding(before, priorContext) || hasPendingClauseBeforeFillers(current.map(c => c.text));
      flush(incomplete ? 0.65 : 0.82, incomplete);
    }
    current.push(cue);
    if (speaker !== null) currentSpeaker = speaker;
    const combined = joinCueText(current.map((item) => item.text));
    const next = cues[index + 1];
    const nextSpeaker = speakerAt(index + 1);
    const continuation = next !== undefined &&
      (nextSpeaker === null || nextSpeaker === currentSpeaker) &&
      (continuesInNextCue(next.text) || continuesNominalizedClause(combined, next.text));
    const quotedContinuation = continuation && next !== undefined && continuesClosedQuotation(combined, next.text);
    const linkedDependency = clauseChains.links.has(index) || (!multipleSpeakersAt(index) && next !== undefined &&
      contextualLink(combined, currentSpeaker, index + 1, cue.end));
    const context: DialogueBoundaryContext = {
      previousText: previousText(),
      nextText: next?.text ?? null,
      turnEnded: next === undefined || !sameSpeaker(currentSpeaker, index + 1) || next.start - cue.end >= pauseThresholdSeconds,
      isReply: isReply(currentSpeaker),
      explicitNextTurn: explicitNextTurn(currentSpeaker, index + 1),
      previousSpeakerUnknown: previousSpeakerUnknown(currentSpeaker),
      previousGapSeconds: previousGap(), nextGapSeconds: next === undefined ? Infinity : next.start - cue.end,
      previousHasMultipleSpeakers: previousHasMultipleSpeakers(),
    };
    const terminalShi = !multipleSpeakersAt(index) && isTerminalAdditiveShi(combined, context);
    const dependency = linkedDependency && !terminalShi;
    const visibleLength = Array.from(combined.replace(/\p{Cf}/gu, "")).length;
    const pendingFiller = hasPendingClauseBeforeFillers(current.map(c => c.text));
    // Keep the safety limit, but don't let invisible directional controls turn
    // an otherwise complete sentence into a forced-length fragment.
    if (visibleLength >= 180) flush(0.65, true);
    else if (multipleSpeakersAt(index)) {
      const lastLine = cue.text.split("\n").at(-1) ?? cue.text;
      flush(0.82, isIncompleteEnding(lastLine, { ...context, turnEnded: true }));
    }
    else if (terminalShi && !continuation) flush(0.90);
    else if (attached && !dependency && !pendingFiller) flush(hasTerminalPunctuation(combined) ? 0.97 : 0.92);
    else if (!dependency && !continuation && !hasOpenQuote(combined) && clauseChains.ends.has(index)) flush(0.91);
    else if (!dependency && !pendingFiller && !quotedContinuation && hasTerminalPunctuation(combined)) flush(0.97);
    else if (!dependency && !pendingFiller && !continuation && hasCompleteEnding(combined, next === undefined, context)) flush(0.94);
  }
  if (current.length > 0) {
    const complete = hasCompleteEnding(joinCueText(current.map(item => item.text)), true, {
      previousText: previousText(), turnEnded: true, isReply: isReply(currentSpeaker),
      previousSpeakerUnknown: previousSpeakerUnknown(currentSpeaker),
    });
    flush(complete ? 0.94 : 0.72, !complete);
  }
  return finalizeLinks(
    groups.map((group, index) => {
      const text = joinCueText(group.cues.map((cue) => cue.text));
      const detected = detectTextLanguage(text);
      return {
        id: `sentence-${String(index + 1).padStart(4, "0")}`,
        cueIds: group.cues.map((cue) => cue.id),
        start: group.cues[0]?.start ?? null,
        end: group.cues.at(-1)?.end ?? null,
        language: detected.language,
        languages: detected.languages,
        text,
        previousSentenceId: null,
        nextSentenceId: null,
        reconstructionConfidence: group.confidence,
        needsReview: group.needsReview,
      };
    }),
  );
}

export function reconstructTextSentences(
  text: string,
): ReconstructedSentence[] {
  const normalized = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
  if (normalized === "") throw new InputError("Text input is empty.");
  const pieces = normalized
    .split(/(?<=[。！？!?…])\s*|(?<=[.!?])\s+|\n+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  return finalizeLinks(
    pieces.map((sentence, index) => {
      const detected = detectTextLanguage(sentence);
      return {
        id: `sentence-${String(index + 1).padStart(4, "0")}`,
        cueIds: [],
        start: null,
        end: null,
        language: detected.language,
        languages: detected.languages,
        text: sentence,
        previousSentenceId: null,
        nextSentenceId: null,
        reconstructionConfidence: 1,
        needsReview: false,
      };
    }),
  );
}

function subtitleFormat(extension: string): SubtitleFormat | null {
  if ([".srt", ".vtt", ".ass", ".ssa"].includes(extension)) {
    return extension.slice(1) as SubtitleFormat;
  }
  return null;
}

export async function loadGrammarInput(input: {
  inputPath?: string;
  text?: string;
}): Promise<LoadedGrammarInput> {
  if ((input.inputPath === undefined) === (input.text === undefined)) {
    throw new InputError("Provide exactly one of inputPath or text.");
  }
  if (input.text !== undefined) {
    return {
      sourceType: "text",
      title: null,
      fileName: null,
      cues: [],
      text: input.text,
    };
  }
  const inputPath = path.resolve(input.inputPath ?? "");
  const extension = path.extname(inputPath).toLowerCase();
  if (extension === ".json") {
    const value = subtitlePackageSchema.safeParse(await readJson(inputPath));
    if (!value.success) {
      throw new InputError(
        "JSON grammar input must be a valid subtitle-package.json; arbitrary objects are rejected.",
        { issues: value.error.issues },
      );
    }
    return {
      sourceType: "subtitle-package",
      title: value.data.identity.title,
      fileName: path.basename(inputPath),
      cues: value.data.cues,
      text: value.data.cues.map((cue) => cue.text).join("\n"),
    };
  }
  if (extension === ".txt") {
    const text = await readFile(inputPath, "utf8");
    return {
      sourceType: "text",
      title: null,
      fileName: path.basename(inputPath),
      cues: [],
      text,
    };
  }
  const format = subtitleFormat(extension);
  if (format === null) {
    throw new InputError("Unsupported grammar input format.", {
      extension,
      supported: [".srt", ".vtt", ".ass", ".ssa", ".txt", ".json"],
    });
  }
  const content = await readFile(inputPath, "utf8");
  const normalized = normalizeSubtitleCues(parseSubtitle(content, format));
  return {
    sourceType: "subtitle",
    title: null,
    fileName: path.basename(inputPath),
    cues: normalized.cues,
    text: normalized.cues.map((cue) => cue.text).join("\n"),
  };
}
