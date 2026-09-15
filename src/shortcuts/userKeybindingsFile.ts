/**
 * 读写用户 keybindings.json（JSONC），用于自定义脚本快捷键。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  SHORTCUT_RUN_COMMAND,
  contextKeyFor,
} from './scriptShortcutKeys';

export interface KeybindingsFileAdapter {
  read(): string | undefined;
  write(text: string): void;
}

interface KeybindingEntry {
  key?: string;
  command?: string;
  args?: { keyId?: string };
  when?: string;
}

export function userDataFolderName(appName: string): string {
  const lower = appName.toLowerCase();
  if (lower.includes('insiders')) {
    return 'Code - Insiders';
  }
  if (lower.includes('cursor')) {
    return 'Cursor';
  }
  return 'Code';
}

export function resolveUserKeybindingsPath(
  appName: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.VSCODE_PORTABLE) {
    return path.join(env.VSCODE_PORTABLE, 'user-data', 'User', 'keybindings.json');
  }

  const folder = userDataFolderName(appName);
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, folder, 'User', 'keybindings.json');
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', folder, 'User', 'keybindings.json');
  }
  return path.join(os.homedir(), '.config', folder, 'User', 'keybindings.json');
}

export function createFsKeybindingsAdapter(filePath: string): KeybindingsFileAdapter {
  return {
    read() {
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch {
        return undefined;
      }
    },
    write(text: string) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, text, 'utf8');
    },
  };
}

export function stripJsonc(text: string): string {
  let result = '';
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < text.length) {
    const char = text[index];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      index += 2;
      while (index < text.length && text[index] !== '\n') {
        index += 1;
      }
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }
    result += char;
    index += 1;
  }
  return result.replace(/,\s*([}\]])/g, '$1');
}

export function parseKeybindingsJsonc(text: string): unknown[] {
  const parsed: unknown = JSON.parse(stripJsonc(text));
  if (!Array.isArray(parsed)) {
    throw new Error('keybindings.json must be a JSON array');
  }
  return parsed;
}

export function isOurShortcutEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  const candidate = entry as KeybindingEntry;
  return candidate.command === SHORTCUT_RUN_COMMAND && typeof candidate.args?.keyId === 'string';
}

export function reconcileShortcutKeybindings(
  entries: unknown[],
  customKeyIds: string[],
): unknown[] {
  const customSet = new Set(customKeyIds);
  const kept = entries.filter((entry) => {
    if (!isOurShortcutEntry(entry)) {
      return true;
    }
    const keyId = (entry as KeybindingEntry).args?.keyId;
    return typeof keyId === 'string' && customSet.has(keyId);
  });

  for (const keyId of customKeyIds) {
    const exists = kept.some(
      (entry) => isOurShortcutEntry(entry) && (entry as KeybindingEntry).args?.keyId === keyId,
    );
    if (!exists) {
      kept.push({
        key: keyId,
        command: SHORTCUT_RUN_COMMAND,
        args: { keyId },
        when: contextKeyFor(keyId),
      });
    }
  }
  return kept;
}

export function listUserKeybindings(adapter: KeybindingsFileAdapter): UserKeybindingList {
  const raw = adapter.read();
  if (raw === undefined) {
    return [];
  }
  try {
    return parseKeybindingsJsonc(raw)
      .filter((entry): entry is KeybindingEntry => Boolean(entry && typeof entry === 'object'))
      .filter((entry) => typeof entry.key === 'string' && typeof entry.command === 'string')
      .map((entry) => ({ key: entry.key as string, command: entry.command as string }));
  } catch {
    return [];
  }
}

export type UserKeybindingList = Array<{ key: string; command: string }>;

export function applyShortcutKeybindingsReconcile(
  adapter: KeybindingsFileAdapter,
  customKeyIds: string[],
): void {
  const raw = adapter.read();
  let entries: unknown[] = [];
  if (raw !== undefined) {
    try {
      entries = parseKeybindingsJsonc(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`JS Runner: could not parse keybindings.json (${message})`);
    }
  }

  const next = reconcileShortcutKeybindings(entries, customKeyIds);
  if (raw === undefined && next.length === 0) {
    return;
  }
  if (raw !== undefined && JSON.stringify(entries) === JSON.stringify(next)) {
    return;
  }
  adapter.write(`${JSON.stringify(next, null, 4)}\n`);
}
