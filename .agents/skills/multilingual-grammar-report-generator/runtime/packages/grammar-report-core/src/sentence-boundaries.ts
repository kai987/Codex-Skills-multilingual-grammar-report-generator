import { extractSpeaker } from "@mvl/subtitle-core";

// These are conservative subtitle heuristics, not a Japanese syntax parser.
// All matching uses a separate view so source text and cue times stay intact.
export function boundaryText(text: string): string {
  const visible = text.replace(/\p{Cf}/gu, "").trim();
  const withoutSound = visible.replace(/^(?:[（(](?:[^()（）]*(?:音|声)|くしゃみ|拍手|笑い|せきばらい|あくび|ため息)[）)]\s*)+/u, "");
  return extractSpeaker(withoutSound.trim() ? withoutSound : visible).text;
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

export interface DialogueBoundaryContext {
  previousText?: string | null;
  nextText?: string | null;
  turnEnded?: boolean;
  isReply?: boolean;
  // A following explicit label is stronger boundary evidence than a pause or
  // EOF, but does not identify the voice of the current unlabelled cue.
  explicitNextTurn?: boolean;
  previousSpeakerUnknown?: boolean;
}

function coreText(text: string): string {
  return boundaryText(text).replace(CLOSERS, "").trim();
}

function hasHesitationToken(text: string): boolean {
  return /(?:^|[\s、，。？！!?…])(?:あっ|ああ|アア|えっ|いや|あの|えっと|ええと)(?=$|[\s、，。？！!?…]|\.{2,})/u.test(text);
}

function intentionalTurnFragment(text: string, context: DialogueBoundaryContext): boolean {
  const visible = boundaryText(text);
  const core = coreText(text);
  if (!context.turnEnded || !ELLIPSIS.test(visible) || core.length > 140) return false;
  const previous = context.previousText ? boundaryText(context.previousText) : "";
  const next = context.nextText ? coreText(context.nextText) : "";
  const hesitationOnly = /^(?:(?:あっ?|ああ|えっ?|ええ|うっ?|うう|いや|いえ|えっと|ええと|あの|その|な|そ|それは)[、，。？！!?….\s]*)+$/u.test(core);
  // A hesitant answer can stop before an unlabelled reassurance. A bare topic
  // at EOF is not enough: require both a real question and audible-form fillers.
  if (hesitationOnly && hasHesitationToken(core) &&
      (context.explicitNextTurn || /[？?]/u.test(previous))) return true;
  if (!context.explicitNextTurn) return false;
  if (/(?:あの|その|えっと|ええと)$/u.test(core) &&
      /(?:というか|いや|あの|えっと)[\s\S]*(?:…|\.{2,})/u.test(visible)) return true;
  // A case-marked constituent may be deliberately suspended during a repair
  // or a startled repetition. Do not generalize this to every trailing particle.
  if (/[がをにと]$/u.test(core) && hasHesitationToken(visible)) return true;
  // Cooperative completion across two explicitly delimited turns is not a
  // license to merge them. Accept only a short constituent / bare predicate.
  return /^[\p{L}ー・]{1,20}[がを]$/u.test(core) &&
    /^[\p{L}ー]{1,24}(?:った|した|いた|ます|ました)$/u.test(next) &&
    !/[はがをにでと？?]/u.test(next);
}

function conventionalEllipsis(text: string, context: DialogueBoundaryContext): boolean {
  const core = coreText(text);
  const response = core.replace(/^(?:(?:あっ|ああ|えっ|ええ|うん|はい|いえ)[、，\s]+)+/u, "");
  // Lexical adverbs and explanatory の are not dangling case/genitive particles.
  if (/^(?:確かに|(?:いえ[、，\s]*)?別に)$/u.test(response)) return true;
  if (/(?:なの|(?:る|く|ぐ|す|む|ぶ|ぬ|う|た)の)[ねよ]*$/u.test(core)) return true;
  if (!context.turnEnded) return false;
  if (intentionalTurnFragment(text, context)) return true;
  if (/^(?:[あえっ、，。？！!?\s]*)(?:いや[、，… .\s]*)+$/u.test(core)) return true;
  if (/(?:待って(?:ください)?)[、，\s]*(?:ちょっと)?$/u.test(core)) return true;
  if (/(?:は|なら)(?:あちら|こちら|そちら)に$/u.test(core.replace(/\s+/gu, ""))) return true;
  // Deliberately suspended judgements are safe only at a turn boundary.
  if (/(?:当然|必要|十分|妥当|無理|よい|いい|ない)かと$/u.test(core)) return true;
  if (/(?:と思う|と思います|そうです|そうなんです)(?:けど|が)$/u.test(core)) return true;
  if (context.explicitNextTurn && /と\s*思って(?:い)?る(?:んだ|のだ)?けど$/u.test(core) &&
      context.nextText && SHORT_RESPONSE.test(coreText(context.nextText))) return true;
  if (/(?:たかった|ればよかった)のに$/u.test(core)) return true;
  const previous = context.previousText === null || context.previousText === undefined
    ? "" : boundaryText(context.previousText);
  if (!previous) return false;
  if (/[？?]/u.test(previous) && /^(?:はい|ええ)[\s\S]{0,25}ですが$/u.test(core)) return true;
  if (context.isReply !== true && context.previousSpeakerUnknown !== true) return false;
  const answer = /^(?:(?:その|この|あの)[\p{L}ー・]+|あちら|こちら|そちら|向こう)(に|を|で|と)$/u.exec(core);
  if (answer?.[1] !== undefined && /[？?]/u.test(previous) &&
      new RegExp(`(?:誰|だれ|何|なに|どこ)${answer[1]}`, "u").test(previous)) return true;
  // A short echoed constituent is a response, not a new unfinished sentence.
  const repeated = /^([\p{L}ー・･]{1,20})(を|が|に|の|と)$/u.exec(core.replace(/^(?:えっ|あっ)[、，\s]+/u, ""));
  if (repeated?.[1] === undefined || !previous.includes(repeated[1])) return false;
  const exactSuspendedEcho = ELLIPSIS.test(boundaryText(text)) &&
    previous.includes(`${repeated[1]}${repeated[2]}`);
  // When the preceding voice is unknown, a shared noun alone is insufficient.
  if (context.isReply !== true) return exactSuspendedEcho;
  return /[？?]/u.test(previous) || hasCompleteEnding(previous) || exactSuspendedEcho;
}

/** High-signal predicate/afterthought pairs; no generic "ends in が" repair. */
export function isPostposedTail(predicate: string, tail: string): boolean {
  const head = boundaryText(predicate);
  const rawTail = boundaryText(tail);
  if (hasOpenQuote(head) || hasOpenQuote(rawTail) ||
      /[。.]["”』」）)]*$/u.test(head) || HARD_TERMINAL.test(rawTail)) return false;
  const p = coreText(head), t = coreText(rawTail);
  if (!t || t.length > 70) return false;
  if (/のが$/u.test(t)) {
    return /(?:怖い|怖かった|好き|苦手|嫌|つらい|楽しい|うれしい|難しい)(?:んだ|のだ|です|でした|だ)?$/u.test(p);
  }
  if (/と$/u.test(t) && /(?:分か|わか|知っ|聞い|思っ|考え|理解|承知|存じ)/u.test(p)) {
    return /(?:だ|だった|です|でした|ない|たい|しい|る|た)と$/u.test(t);
  }
  if (/のは$/u.test(t)) return /(?:なんで|どうして|なぜ)[\s\S]*(?:だろう|でしょう|だ|なの|か)$/u.test(p);
  if (/^[\p{L}\p{N}ー・\s]{1,24}は$/u.test(t)) return /(?:何なんだ|何なの|何者なんだ|なんなんだ)$/u.test(p);
  if (/^[\p{L}\p{N}ー・\s]{1,24}が$/u.test(t)) {
    const explicitActor = /(?:私|僕|俺|彼女|彼|あなた|君|[\p{Script=Han}]{1,8}さん)[はが]/u.test(p);
    // Without a comma, a bare NP after an ordinary past predicate remains
    // ambiguous. Preparation-before-arrival てきました is a narrower signal.
    return !explicitActor && (/(?:て|で)きました$/u.test(p) ||
      (/[、，,]$/u.test(head) && /(?:ました|[いっ]た|ったんだ)$/u.test(p)));
  }
  if (/を$/u.test(t)) return /(?:覚え|忘れ|見た|見ま|聞い)[\s\S]*(?:か|の|た|ます|ました)$/u.test(p);
  if (/に$/u.test(t)) return /(?:感謝|感動|驚|気付|気づ)[\s\S]*(?:ます|ました|んだ|のだ|です)$/u.test(p);
  return false;
}

function sameCueInversion(text: string): boolean {
  const visible = boundaryText(text);
  // A comma, question mark or original line break supplies evidence for the
  // split; do not invent an arbitrary split inside an unpunctuated string.
  for (const m of visible.matchAll(/[、，,？?!！\n]/gu)) {
    const at = (m.index ?? 0) + m[0].length;
    if (isPostposedTail(visible.slice(0, at), visible.slice(at))) return true;
  }
  return false;
}

export function isTemporalTopicContinuation(topic: string, nextText: string): boolean {
  const core = coreText(topic);
  return /^(?:(?:あの|その|この)日|今日|今夜|明日|昨日|あの時|その時)[はも]$/u.test(core) &&
    !hasOpenQuote(boundaryText(nextText)) && hasCompleteEnding(nextText) &&
    !/は/u.test(boundaryText(nextText));
}

export function continuesNominalizedClause(text: string, nextText: string): boolean {
  return /の$/u.test(coreText(text)) &&
    /^(?:が|は|を|に|で)(?:[、，\s]|[\p{Script=Han}\p{Script=Katakana}]|$)/u.test(boundaryText(nextText));
}

export function continuesClosedQuotation(text: string, nextText: string): boolean {
  return /[」』”"]$/u.test(boundaryText(text)) &&
    /^(?:と|って)/u.test(boundaryText(nextText));
}

export function isIncompleteEnding(text: string, context: DialogueBoundaryContext = {}): boolean {
  const visible = boundaryText(text);
  if (hasOpenQuote(visible)) return true;
  if (HARD_TERMINAL.test(visible)) return false;
  if (sameCueInversion(visible) || conventionalEllipsis(visible, context)) return false;
  return CONTINUATION_END.test(visible.replace(CLOSERS, ""));
}

export function continuesInNextCue(text: string): boolean {
  const next = boundaryText(text).replace(/\s+/gu, "");
  return /^(?:と(?:いう|言|伝|聞|思|考|答|頼|説明|$)|って|ので|のに|けど|けれど|が[、，]|から(?:[、，]|$)|なら(?:[、，]|$))/u.test(next);
}

export function hasCompleteEnding(text: string, atEndOfInput = false, context: DialogueBoundaryContext = {}): boolean {
  const visible = boundaryText(text);
  if (hasOpenQuote(visible)) return false;
  if (HARD_TERMINAL.test(visible)) return true;
  if (sameCueInversion(visible) || conventionalEllipsis(visible, {
    ...context, turnEnded: context.turnEnded === true || atEndOfInput,
  })) return true;
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
