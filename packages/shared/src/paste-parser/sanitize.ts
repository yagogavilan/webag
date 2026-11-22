import { PASTE_MAX_LINE_LENGTH } from './types.js';

/**
 * Limpeza de linha (C-CAD-04). Tudo aqui é linear no tamanho da entrada: cada linha é cortada em
 * `HARD_SLICE` caracteres ANTES de qualquer expressão regular rodar, então nenhuma regex vê mais que isso.
 */
const HARD_SLICE = 2000;

// Controle C0/C1 (menos tab, VT e FF, que viram espaço), DEL, hífen suave, zero-width, marcas bidi (Trojan Source) e BOM.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const PICTOGRAPHS = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}️⃣]/gu;
const WHITESPACE = /\s+/g;
const HAS_CONTENT = /[\p{L}\p{N}]/u;

// Prefixos que o WhatsApp põe ao copiar mensagens [HIPÓTESE: formatos conferidos só por exemplos, não por exportação real].
const WHATSAPP_PREFIXES = [
  /^\[\d{1,2}:\d{2}(?::\d{2})?,? \d{1,2}\/\d{1,2}\/\d{2,4}\] [^:]{1,40}: /,
  /^\[\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?\] [^:]{1,40}: /,
  /^\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}(?::\d{2})? - [^:]{1,40}: /,
];

const LINE_BREAKS = /\r\n|[\n\r\u2028\u2029\u0085]/;

export function splitLines(text: string): string[] {
  return text.split(LINE_BREAKS);
}

export function hasContent(text: string): boolean {
  return HAS_CONTENT.test(text);
}

export interface CleanLine {
  text: string;
  /** A linha original passava de 200 caracteres e foi cortada. */
  truncated: boolean;
}

export function cleanLine(raw: string): CleanLine {
  const head = raw.slice(0, HARD_SLICE);
  let text = head.replace(CONTROL, '').replace(PICTOGRAPHS, ' ').replace(WHITESPACE, ' ').trim();
  for (const prefix of WHATSAPP_PREFIXES) {
    const stripped = text.replace(prefix, '');
    if (stripped !== text) {
      text = stripped.trim();
      break;
    }
  }
  let truncated = raw.length > HARD_SLICE && raw.slice(HARD_SLICE).trim() !== '';
  if (text.length > PASTE_MAX_LINE_LENGTH) {
    truncated = true;
    text = text.slice(0, PASTE_MAX_LINE_LENGTH);
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) text = text.slice(0, -1);
    text = text.trimEnd();
  }
  return { text, truncated };
}
