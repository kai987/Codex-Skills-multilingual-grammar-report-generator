import { extractSpeaker } from "@mvl/subtitle-core";

// These are conservative subtitle heuristics, not a Japanese syntax parser.
// All matching uses a separate view so source text and cue times stay intact.
export function boundaryText(text: string): string {
  const visible = text.replace(/\p{Cf}/gu, "").trim();
  return extractSpeaker(visible).text;
}

function hasOpenQuote(text: string): boolean {
  const pairs: Readonly<Record<string, string>> = {
    "「": "」", "『": "』", "“": "”", "（": "）", "(": ")", "[": "]",
  };
  const closing = new Set(Object.values(pairs));
  const stack: string[] = [];
  let asciiQuote = false;
  for (const char of text) {
    if (char === '"') asciiQuote = !asciiQuote;
    else if (pairs[char] !== undefined) stack.push(pairs[char]!);
    else if (closing.has(char) && stack.at(-1) === char) stack.pop();
  }
  return stack.length > 0 || asciiQuote;
}

const CLOSERS = /[。！？!?….,、，"”’』」）)\]]+$/u;
const HARD_TERMINAL = /(?:[。！？!?]|(?<!\.)\.)["'”’』」）)\]]*$/u;
const ELLIPSIS = /(?:…|\.{2,})["'”’』」）)\]]*$/u;
const CONTINUATION_END = /(?:ので|のに|けど|けれど(?:も)?|ながら|つつ|たり|として|という|といった|ために|ように|には|よりも|もらい|いただき|[はがをにとのや]|⸺|[—-])$/u;
const JAPANESE_FINITE = /(?:です|でした|ます|ました|ません(?:でした)?|ください|なさい|だった|なんだ|のだ|んだ|だろう|でしょう|はずだ|そうだ|そうか)(?:よね|[ねよなぞさか])*$/u;
const QUOTED_ELLIPSIS = /[」』”"]って$/u;
const SHORT_RESPONSE = /^(?:はい|いいえ|うん|ううん|ええ|そう|なるほど|ありがとう(?:ございます)?|すみません|ごめん(?:なさい)?)[ねよな]*$/u;
// Only high-signal adjective endings are recognized at EOF. Ambiguous noun
// fragments and verb stems still need review, rather than being guessed.
const ADJECTIVE_PREDICATE = /(?:[\p{Script=Han}ぁ-ゖー]+(?:しい|さい)|[\p{L}ー]+(?:ない|たい)|寒い|暑い|眠い|怖い|高い|低い|強い|弱い|多い|少ない|いい|良い|悪い)[ねよな]*$/u;

export function continuesClosedQuotation(text: string, nextText: string): boolean {
  return /[」』”"]$/u.test(boundaryText(text)) &&
    /^(?:と|って)/u.test(boundaryText(nextText));
}

export function isIncompleteEnding(text: string): boolean {
  const visible = boundaryText(text);
  if (hasOpenQuote(visible)) return true;
  if (HARD_TERMINAL.test(visible)) return false;
  return CONTINUATION_END.test(visible.replace(CLOSERS, ""));
}

export function continuesInNextCue(text: string): boolean {
  const next = boundaryText(text).replace(/\s+/gu, "");
  return /^(?:と(?:いう|言|伝|聞|思|考|答|頼|説明|$)|って|ので|のに|けど|けれど|が[、，]|から(?:[、，]|$)|なら(?:[、，]|$))/u.test(next);
}

export function hasCompleteEnding(text: string, atEndOfInput = false): boolean {
  const visible = boundaryText(text);
  if (hasOpenQuote(visible)) return false;
  if (HARD_TERMINAL.test(visible)) return true;
  const core = visible.replace(CLOSERS, "");
  if (QUOTED_ELLIPSIS.test(visible)) return true;
  if (CONTINUATION_END.test(core)) return false;
  return JAPANESE_FINITE.test(core) || SHORT_RESPONSE.test(core) ||
    (atEndOfInput && ADJECTIVE_PREDICATE.test(core));
}

export function hasTerminalPunctuation(text: string): boolean {
  const visible = boundaryText(text);
  return !hasOpenQuote(visible) && (HARD_TERMINAL.test(visible) ||
    (ELLIPSIS.test(visible) && !isIncompleteEnding(visible)));
}
