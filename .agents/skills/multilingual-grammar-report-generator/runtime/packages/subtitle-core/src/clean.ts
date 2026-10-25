const ALLOWED_HTML_TAG = /<\/?(?:b|i|u|font|span|ruby|rt|c)(?:\s[^>]*)?>/giu;
const ASS_OVERRIDE = /\{\\[^}]*\}/gu;
const SOUND_ANNOTATION = /^(?:.*[のを].*音|.*(?:泣き|鳴き|笑い|つぶやき)声|.*(?:バイブレーター|警笛|歓声|拍手)|音|声|つぶやき声|足音|呼び出し音|ため息|騒ぎ声|泣き声|鳴き声|笑い声|笑い|笑|くしゃみ|あくび|せきばらい|ホイッスル|音楽|BGM|SE|♪.*)$/iu;

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
};

export function cleanSubtitleText(value: string): string {
  let output = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        code === 9 || code === 10 || code === 13 || (code > 31 && code !== 127)
      );
    })
    .join("")
    .replace(ASS_OVERRIDE, "")
    .replace(/\\[Nn]/gu, "\n")
    .replace(/\\h/gu, " ")
    .replace(ALLOWED_HTML_TAG, "");
  for (const [entity, replacement] of Object.entries(ENTITIES)) {
    output = output.replaceAll(entity, replacement);
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line, index, lines) =>
        line !== "" || (index > 0 && index < lines.length - 1),
    )
    .join("\n")
    .trim();
}

export function extractSpeaker(text: string): {
  speaker: string | null;
  text: string;
} {
  // Directional controls in SRT files are not part of a speaker's name.
  // This is a detection-only view; parsers keep the original cleaned cue text.
  const visible = text.replace(/\p{Cf}/gu, "").trim();
  const inline = /^(?:[-–—]\s*)?[（(]((?:[^()（）\n]|[（(][ぁ-ゖァ-ヶー]+[）)]){1,60})[）)]\s*([\s\S]*)$/u.exec(visible);
  if (inline?.[1] !== undefined && inline[2] !== undefined) {
    const label = inline[1].replace(/[（(][ぁ-ゖァ-ヶー]+[）)]/gu, "").trim();
    const actionAnnotation = /(?:[がを].*[くるすたて]$|ながら|ている|てる|する|した|開く|閉まる|鳴る|泣く|小声で|ささやく)/u;
    const japaneseLabel = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(label);
    if (japaneseLabel && /^[\p{L}\p{N} ._'’ー・-]+$/u.test(label) &&
        !SOUND_ANNOTATION.test(label) && !actionAnnotation.test(label)) {
      return { speaker: label, text: inline[2].trim() };
    }
  }
  const match =
    /^(?:[-–—]\s*)?([\p{L}\p{N}][\p{L}\p{N} ._'’-]{0,40}):\s+(.+)$/su.exec(
      visible,
    );
  if (match?.[1] === undefined || match[2] === undefined) {
    return { speaker: null, text };
  }
  return { speaker: match[1].trim(), text: match[2].trim() };
}

/** All explicit line-leading people in a cue, without assigning unlabelled speech. */
export function extractCueSpeakers(text: string, metadataSpeaker: string | null = null): string[] {
  const names = metadataSpeaker === null || SOUND_ANNOTATION.test(metadataSpeaker)
    ? [] : [metadataSpeaker];
  for (const line of text.split("\n")) {
    const speaker = extractSpeaker(line).speaker;
    if (speaker !== null && !SOUND_ANNOTATION.test(speaker)) names.push(speaker);
  }
  return [...new Set(names)];
}
