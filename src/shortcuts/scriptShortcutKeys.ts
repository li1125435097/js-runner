/**
 * npm 脚本快捷键：目录、键语法、占用/冲突检测（不依赖 vscode）。
 */

export const SHORTCUTS_STATE_KEY = 'jsRunner.scriptShortcuts';
export const SHORTCUT_RUN_COMMAND = 'jsRunner.runNpmScriptByShortcut';

export type ShortcutSource = 'catalog' | 'custom';
export type CatalogGroup = 'function' | 'recommended' | 'recommendedExtra';
export type OccupancyKind = 'free' | 'reserved' | 'script' | 'user' | 'default';

export interface ScriptShortcutBinding {
  packageKey: string;
  scriptName: string;
  source: ShortcutSource;
}

export type ScriptShortcutMap = Record<string, ScriptShortcutBinding>;

export interface CatalogKey {
  keyId: string;
  key: string;
  contextKey: string;
  label: string;
  group: CatalogGroup;
}

export interface UserKeybinding {
  key: string;
  command: string;
}

export interface ShortcutStoreLike {
  getMap(): ScriptShortcutMap;
  listUserBindings(): UserKeybinding[];
  assign(keyId: string, packageKey: string, scriptName: string): Promise<void>;
  clearForScript(packageKey: string, scriptName: string): Promise<void>;
}

export interface OccupancyInput {
  bindings: ScriptShortcutMap;
  userBindings: UserKeybinding[];
}

export interface KeyOccupancy {
  keyId: string;
  kind: OccupancyKind;
  label: string;
  commandId?: string;
  scriptRef?: string;
}

const MODIFIER_ALIASES: Record<string, string> = {
  control: 'ctrl',
  ctrl: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  meta: 'meta',
  win: 'win',
  windows: 'win',
  cmd: 'cmd',
  command: 'cmd',
};

const MODIFIER_ORDER = ['ctrl', 'shift', 'alt', 'meta', 'win', 'cmd'];

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
};

const NAMED_KEYS = new Set([
  'escape',
  'tab',
  'enter',
  'space',
  'backspace',
  'delete',
  'insert',
  'home',
  'end',
  'pageup',
  'pagedown',
  'up',
  'down',
  'left',
  'right',
  'pause',
  'capslock',
  'numlock',
  'scrolllock',
  'contextmenu',
  'numpad0',
  'numpad1',
  'numpad2',
  'numpad3',
  'numpad4',
  'numpad5',
  'numpad6',
  'numpad7',
  'numpad8',
  'numpad9',
  'numpad_add',
  'numpad_subtract',
  'numpad_multiply',
  'numpad_divide',
  'numpad_decimal',
]);

/** 硬拒绝：OS / 本扩展已占用，不允许绑定。 */
export const RESERVED_KEYS = new Set(['f4', 'ctrl+f4', 'alt+f4']);

/** 常见 VS Code / Cursor 默认快捷键，无法通过公开 API 穷尽。 */
export const DEFAULT_KEY_LABELS: Record<string, string> = {
  f1: 'Command Palette',
  f2: 'Rename Symbol',
  f3: 'Find Next',
  f4: 'JS Runner: Run File',
  f5: 'Start Debugging',
  f6: 'Focus Next Part',
  f8: 'Go to Next Problem',
  f9: 'Toggle Breakpoint',
  f10: 'Step Over',
  f11: 'Step Into',
  f12: 'Go to Definition',
  'shift+f3': 'Find Previous',
  'shift+f5': 'Stop Debugging',
  'shift+f8': 'Go to Previous Problem',
  'shift+f10': 'Show Context Menu',
  'shift+f11': 'Step Out',
  'shift+f12': 'Go to References',
  'ctrl+f4': 'JS Runner: Run File in New Terminal',
  'ctrl+f5': 'Run Without Debugging',
  'ctrl+f12': 'Go to Implementation',
  'ctrl+shift+f5': 'Restart Debugging',
  'ctrl+s': 'Save',
  'ctrl+shift+s': 'Save As',
  'ctrl+p': 'Go to File',
  'ctrl+shift+p': 'Command Palette',
  'ctrl+f': 'Find',
  'ctrl+shift+f': 'Find in Files',
  'ctrl+h': 'Replace',
  'ctrl+shift+h': 'Replace in Files',
  'ctrl+c': 'Copy',
  'ctrl+v': 'Paste',
  'ctrl+x': 'Cut',
  'ctrl+z': 'Undo',
  'ctrl+y': 'Redo',
  'ctrl+shift+z': 'Redo',
  'ctrl+a': 'Select All',
  'ctrl+w': 'Close Editor',
  'ctrl+n': 'New File',
  'ctrl+o': 'Open File',
  'ctrl+b': 'Toggle Primary Sidebar',
  'ctrl+j': 'Toggle Panel',
  'ctrl+shift+e': 'Show Explorer',
  'ctrl+shift+g': 'Show Source Control',
  'ctrl+shift+d': 'Show Debug',
  'ctrl+shift+x': 'Show Extensions',
};

export function contextKeyFor(keyId: string): string {
  const camel = keyId
    .split('+')
    .map((part, index) => {
      const safe = part.replace(/[^a-zA-Z0-9]/g, '');
      if (!safe) {
        return 'X';
      }
      return index === 0 ? safe : `${safe.charAt(0).toUpperCase()}${safe.slice(1)}`;
    })
    .join('');
  return `jsRunner.shortcut.${camel}`;
}

export function formatKeyLabel(keyId: string): string {
  return keyId
    .split('+')
    .map((part) => {
      if (/^f\d{1,2}$/.test(part)) {
        return part.toUpperCase();
      }
      if (part.length === 1) {
        return part.toUpperCase();
      }
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join('+');
}

export function scriptShortcutRef(packageKey: string, scriptName: string): string {
  return `${packageKey}::${scriptName}`;
}

function isValidKey(key: string): boolean {
  if (/^f([1-9]|1[0-2])$/.test(key)) {
    return true;
  }
  if (/^[a-z0-9]$/.test(key)) {
    return true;
  }
  if (NAMED_KEYS.has(key)) {
    return true;
  }
  return /^[-=[\]\\;',./`]$/.test(key);
}

export function parseKeybinding(
  input: string,
): { ok: true; keyId: string } | { ok: false; error: string } {
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { ok: false, error: 'Enter a keybinding, e.g. ctrl+shift+b' };
  }
  if (trimmed.includes(' ')) {
    return { ok: false, error: 'Chords (two keystrokes) are not supported' };
  }

  const parts = trimmed
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return { ok: false, error: 'Enter a keybinding, e.g. ctrl+shift+b' };
  }

  const modifiers: string[] = [];
  let key: string | undefined;
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part];
    if (modifier) {
      if (modifiers.includes(modifier)) {
        return { ok: false, error: 'Duplicate modifier' };
      }
      modifiers.push(modifier);
      continue;
    }
    if (key) {
      return { ok: false, error: 'Use a single key after modifiers, e.g. ctrl+alt+f5' };
    }
    key = KEY_ALIASES[part] ?? part;
  }

  if (!key) {
    return { ok: false, error: 'Add a key after modifiers, e.g. ctrl+alt+f5' };
  }
  if (!isValidKey(key)) {
    return { ok: false, error: 'Unknown key. Use F1–F12, a letter, or a named key' };
  }

  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return { ok: true, keyId: [...modifiers, key].join('+') };
}

function buildCatalog(): CatalogKey[] {
  const keys: CatalogKey[] = [];
  for (let index = 1; index <= 12; index += 1) {
    if (index === 4) {
      continue;
    }
    const keyId = `f${index}`;
    keys.push({
      keyId,
      key: keyId,
      contextKey: contextKeyFor(keyId),
      label: formatKeyLabel(keyId),
      group: 'function',
    });
  }
  for (let index = 1; index <= 12; index += 1) {
    const keyId = `ctrl+alt+f${index}`;
    keys.push({
      keyId,
      key: keyId,
      contextKey: contextKeyFor(keyId),
      label: formatKeyLabel(keyId),
      group: 'recommended',
    });
  }
  for (let index = 1; index <= 12; index += 1) {
    const keyId = `ctrl+shift+alt+f${index}`;
    keys.push({
      keyId,
      key: keyId,
      contextKey: contextKeyFor(keyId),
      label: formatKeyLabel(keyId),
      group: 'recommendedExtra',
    });
  }
  return keys;
}

export const CATALOG_KEYS: CatalogKey[] = buildCatalog();

const CATALOG_BY_ID = new Map(CATALOG_KEYS.map((item) => [item.keyId, item]));

export function isCatalogKey(keyId: string): boolean {
  return CATALOG_BY_ID.has(keyId);
}

export function catalogKeyFor(keyId: string): CatalogKey | undefined {
  return CATALOG_BY_ID.get(keyId);
}

function normalizeUserKey(key: string): string | undefined {
  const parsed = parseKeybinding(key);
  return parsed.ok ? parsed.keyId : undefined;
}

export function inspectKey(keyId: string, input: OccupancyInput): KeyOccupancy {
  const label = formatKeyLabel(keyId);
  if (RESERVED_KEYS.has(keyId)) {
    return {
      keyId,
      kind: 'reserved',
      label: keyId === 'alt+f4' ? 'Alt+F4 closes the window' : 'Reserved by JS Runner (Run File)',
    };
  }

  const binding = input.bindings[keyId];
  if (binding) {
    const scriptRef = scriptShortcutRef(binding.packageKey, binding.scriptName);
    return {
      keyId,
      kind: 'script',
      label: `Used by ${scriptRef}`,
      scriptRef,
    };
  }

  for (const user of input.userBindings) {
    if (user.command.startsWith('-')) {
      continue;
    }
    if (user.command === SHORTCUT_RUN_COMMAND) {
      continue;
    }
    const normalized = normalizeUserKey(user.key);
    if (normalized === keyId) {
      return {
        keyId,
        kind: 'user',
        label: `Bound to ${user.command}`,
        commandId: user.command,
      };
    }
  }

  const defaultLabel = DEFAULT_KEY_LABELS[keyId];
  if (defaultLabel) {
    return {
      keyId,
      kind: 'default',
      label: defaultLabel,
    };
  }

  return { keyId, kind: 'free', label };
}

export function isHardBlock(occupancy: KeyOccupancy): boolean {
  return occupancy.kind === 'reserved';
}

export function findShortcutForScript(
  bindings: ScriptShortcutMap,
  packageKey: string,
  scriptName: string,
): { keyId: string; binding: ScriptShortcutBinding } | undefined {
  for (const [keyId, binding] of Object.entries(bindings)) {
    if (binding.packageKey === packageKey && binding.scriptName === scriptName) {
      return { keyId, binding };
    }
  }
  return undefined;
}

export function catalogKeysForPicker(
  group: CatalogGroup,
  input: OccupancyInput,
  currentKeyId: string | undefined,
): CatalogKey[] {
  return CATALOG_KEYS.filter((item) => {
    if (item.group !== group) {
      return false;
    }
    if (item.keyId === currentKeyId) {
      return false;
    }
    const occupancy = inspectKey(item.keyId, input);
    if (occupancy.kind === 'reserved' || occupancy.kind === 'user' || occupancy.kind === 'default') {
      return false;
    }
    return occupancy.kind === 'free' || occupancy.kind === 'script';
  });
}
