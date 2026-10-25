import type { SubtitleCue } from "@mvl/shared";
import {
  boundaryText, clauseDependency, continuesInNextCue, continuesNominalizedClause,
  hasCompleteEnding, hasOpenQuote, isBareTopic, isClauseFiller, isStartledDenial, isWaitCall, isStandaloneAcknowledgement,
  isContextualNominalConclusion,
  MAX_CLAUSE_GAP_SECONDS,
  isQuotedThoughtClosure,
} from "./sentence-boundaries.js";

// Separate from the ordinary pause threshold and the 3-second inversion repair.
// A larger rhetorical gap is usable only after proving a bounded, complete chain.
const MAX_CHAIN_CUES = 12;
const MAX_VISIBLE_LENGTH = 180;

function blocksChain(text: string): boolean {
  const visible = boundaryText(text);
  return hasOpenQuote(visible) || /[？?]/u.test(visible) || isStartledDenial(text) || isWaitCall(text) ||
    isStandaloneAcknowledgement(text) ||
    /^(?:ところで|さて|それでは)(?:[、，\s]|$)/u.test(visible);
}

export function findClauseChains(
  cues: readonly SubtitleCue[],
  speakers: readonly (readonly string[])[],
  ordinaryPause: number,
): { links: Set<number>; ends: Set<number> } {
  const links = new Set<number>(), ends = new Set<number>();
  for (let start = 0; start < cues.length; start++) {
    const first = cues[start]!;
    if ((speakers[start]?.length ?? 0) > 1 || blocksChain(first.text)) continue;
    const intro = /思って(?:い)?た$/u.test(boundaryText(first.text)) &&
      cues[start + 1] !== undefined && isBareTopic(cues[start + 1]!.text);
    if (!clauseDependency(first.text) && !intro) continue;
    let known = speakers[start]?.[0] ?? null;
    let combined = "", dependentCount = 0, crossesPause = false;
    for (let end = start; end < Math.min(cues.length, start + MAX_CHAIN_CUES); end++) {
      const cue = cues[end]!;
      if ((speakers[end]?.length ?? 0) > 1 || blocksChain(cue.text)) break;
      if (end > start) {
        const gap = cue.start - cues[end - 1]!.end;
        const nextSpeaker = speakers[end]?.[0] ?? null;
        if (gap > MAX_CLAUSE_GAP_SECONDS || (nextSpeaker !== null && nextSpeaker !== known)) break;
        if (nextSpeaker !== null) known = nextSpeaker;
        crossesPause ||= gap >= ordinaryPause;
      }
      combined += cue.text;
      if (Array.from(combined.replace(/\p{Cf}/gu, "")).length >= MAX_VISIBLE_LENGTH) break;
      if (clauseDependency(cue.text)) dependentCount++;
      else if (!(end === start && intro) && !isClauseFiller(cue.text)) {
        const next = cues[end + 1];
        const continues = next !== undefined && (continuesInNextCue(next.text) ||
          continuesNominalizedClause(cue.text, next.text));
        // One lone trailing connective is not enough to defeat an ordinary
        // pause; require at least two explicit dependency signals for that.
        const closesNominal = dependentCount >= 2 && end > start &&
          isContextualNominalConclusion(cue.text, cues[end - 1]!.text);
        if (end > start && (hasCompleteEnding(cue.text, true) || isQuotedThoughtClosure(cue.text) || closesNominal) && !continues &&
            (!crossesPause || dependentCount >= 2)) {
          for (let i = start; i < end; i++) links.add(i);
          ends.add(end);
        }
        break;
      }
    }
  }
  return { links, ends };
}
