/** package.json 顶层 scripts 中单个脚本名在原文里的位置 */
export interface LocatedNpmScript {
  name: string;
  command: string;
  keyStartOffset: number;
  keyEndOffset: number;
}

/**
 * 解析 package.json 文本，定位顶层 scripts 每个脚本名的 key range。
 * 非法 JSON、无 scripts、或扫描失败时返回空数组。
 */
export function locateNpmScripts(text: string): LocatedNpmScript[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const scriptCommands = stringScriptCommands((parsed as { scripts?: unknown }).scripts);
  if (!scriptCommands) {
    return [];
  }

  try {
    return scanTopLevelScripts(text, scriptCommands);
  } catch {
    return [];
  }
}

function stringScriptCommands(scripts: unknown): Record<string, string> | undefined {
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [name, command] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof command === 'string') {
      result[name] = command;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function scanTopLevelScripts(
  text: string,
  scriptCommands: Record<string, string>,
): LocatedNpmScript[] {
  let index = skipBom(text, 0);
  index = skipWhitespace(text, index);
  if (text[index] !== '{') {
    return [];
  }
  index += 1;

  const found = new Map<string, LocatedNpmScript>();

  while (index < text.length) {
    index = skipWhitespace(text, index);
    if (text[index] === '}') {
      break;
    }
    if (text[index] === ',') {
      index += 1;
      continue;
    }

    const key = parseJsonString(text, index);
    index = skipWhitespace(text, key.next);
    if (text[index] !== ':') {
      throw new Error('expected colon');
    }
    index = skipWhitespace(text, index + 1);

    if (key.value === 'scripts' && text[index] === '{') {
      found.clear();
      collectScriptKeys(text, index, scriptCommands, found);
    }

    index = skipJsonValue(text, index);
  }

  return [...found.values()];
}

function collectScriptKeys(
  text: string,
  objectStart: number,
  scriptCommands: Record<string, string>,
  found: Map<string, LocatedNpmScript>,
): void {
  let index = objectStart + 1;

  while (index < text.length) {
    index = skipWhitespace(text, index);
    if (text[index] === '}') {
      return;
    }
    if (text[index] === ',') {
      index += 1;
      continue;
    }

    const key = parseJsonString(text, index);
    index = skipWhitespace(text, key.next);
    if (text[index] !== ':') {
      throw new Error('expected colon');
    }
    index = skipWhitespace(text, index + 1);

    const command = scriptCommands[key.value];
    if (typeof command === 'string' && text[index] === '"') {
      found.set(key.value, {
        name: key.value,
        command,
        keyStartOffset: key.start,
        keyEndOffset: key.end,
      });
    }

    index = skipJsonValue(text, index);
  }
}

function parseJsonString(
  text: string,
  start: number,
): { value: string; start: number; end: number; next: number } {
  if (text[start] !== '"') {
    throw new Error('expected string');
  }

  let index = start + 1;
  let value = '';

  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      const end = index + 1;
      return { value, start, end, next: end };
    }

    if (char === '\\') {
      const next = text[index + 1];
      if (next === 'u') {
        const hex = text.slice(index + 2, index + 6);
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
        continue;
      }

      const escaped: Record<string, string> = {
        '"': '"',
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
      };
      value += escaped[next] ?? next;
      index += 2;
      continue;
    }

    value += char;
    index += 1;
  }

  throw new Error('unterminated string');
}

function skipJsonValue(text: string, start: number): number {
  const char = text[start];
  if (char === '"') {
    return parseJsonString(text, start).next;
  }
  if (char === '{') {
    return skipJsonContainer(text, start, '{', '}');
  }
  if (char === '[') {
    return skipJsonContainer(text, start, '[', ']');
  }
  if (char === 't') {
    return skipLiteral(text, start, 'true');
  }
  if (char === 'f') {
    return skipLiteral(text, start, 'false');
  }
  if (char === 'n') {
    return skipLiteral(text, start, 'null');
  }

  const match = text.slice(start).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!match) {
    throw new Error('expected JSON value');
  }
  return start + match[0].length;
}

function skipJsonContainer(
  text: string,
  start: number,
  open: '{' | '[',
  close: '}' | ']',
): number {
  let index = start + 1;
  while (index < text.length) {
    index = skipWhitespace(text, index);
    if (text[index] === close) {
      return index + 1;
    }
    if (text[index] === ',') {
      index += 1;
      continue;
    }
    if (open === '{') {
      index = parseJsonString(text, index).next;
      index = skipWhitespace(text, index);
      if (text[index] !== ':') {
        throw new Error('expected colon');
      }
      index = skipWhitespace(text, index + 1);
    }
    index = skipJsonValue(text, index);
  }
  throw new Error('unterminated container');
}

function skipLiteral(text: string, start: number, literal: string): number {
  if (!text.startsWith(literal, start)) {
    throw new Error(`expected ${literal}`);
  }
  return start + literal.length;
}

function skipBom(text: string, index: number): number {
  return text.charCodeAt(index) === 0xfeff ? index + 1 : index;
}

function skipWhitespace(text: string, index: number): number {
  while (index < text.length) {
    const char = text[index];
    if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
      break;
    }
    index += 1;
  }
  return index;
}
