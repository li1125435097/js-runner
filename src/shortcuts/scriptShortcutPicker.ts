/**
 * 为 npm 脚本选择或自定义运行快捷键（QuickPick + Custom 输入）。
 */
import * as vscode from 'vscode';
import { NpmScriptInfo } from '../common/types';
import {
  CatalogKey,
  OccupancyInput,
  ShortcutStoreLike,
  catalogKeysForPicker,
  findShortcutForScript,
  formatKeyLabel,
  inspectKey,
  isHardBlock,
  parseKeybinding,
} from './scriptShortcutKeys';

interface ShortcutPickItem extends vscode.QuickPickItem {
  action: 'keep' | 'clear' | 'key' | 'custom';
  keyId?: string;
}

export async function promptSetNpmScriptShortcut(
  script: NpmScriptInfo,
  packageKey: string,
  store: ShortcutStoreLike,
): Promise<'assigned' | 'cleared' | 'cancelled'> {
  const scriptLabel = `${packageKey}::${script.name}`;
  const occupancyInput: OccupancyInput = {
    bindings: store.getMap(),
    userBindings: store.listUserBindings(),
  };
  const current = findShortcutForScript(occupancyInput.bindings, packageKey, script.name);

  const items: ShortcutPickItem[] = [];
  if (current) {
    items.push({
      action: 'keep',
      keyId: current.keyId,
      label: formatKeyLabel(current.keyId),
      description: 'Currently assigned',
      picked: true,
    });
    items.push({
      action: 'clear',
      label: 'Clear shortcut',
      description: 'Remove the keyboard shortcut for this script',
    });
  }

  pushCatalogSection(
    items,
    'Unused function keys',
    catalogKeysForPicker('function', occupancyInput, current?.keyId),
    occupancyInput,
  );
  pushCatalogSection(
    items,
    'Recommended combinations',
    catalogKeysForPicker('recommended', occupancyInput, current?.keyId),
    occupancyInput,
  );
  pushCatalogSection(
    items,
    'More combinations',
    catalogKeysForPicker('recommendedExtra', occupancyInput, current?.keyId),
    occupancyInput,
  );

  items.push({
    action: 'custom',
    label: 'Custom...',
    description: 'Enter a keybinding, e.g. ctrl+shift+b',
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: `Shortcut for ${scriptLabel}`,
    placeHolder: 'Choose an unused key or a recommended combination',
  });
  if (!picked) {
    return 'cancelled';
  }
  if (picked.action === 'keep') {
    return 'cancelled';
  }
  if (picked.action === 'clear') {
    await store.clearForScript(packageKey, script.name);
    return 'cleared';
  }
  if (picked.action === 'custom') {
    return promptCustomShortcut(script, packageKey, store, occupancyInput);
  }
  if (!picked.keyId) {
    return 'cancelled';
  }
  return assignWithConfirm(picked.keyId, packageKey, script, store, occupancyInput);
}

function pushCatalogSection(
  items: ShortcutPickItem[],
  heading: string,
  keys: CatalogKey[],
  occupancyInput: OccupancyInput,
): void {
  if (keys.length === 0) {
    return;
  }
  items.push({
    action: 'keep',
    label: heading,
    kind: vscode.QuickPickItemKind.Separator,
  });
  for (const key of keys) {
    const occupancy = inspectKey(key.keyId, occupancyInput);
    items.push({
      action: 'key',
      keyId: key.keyId,
      label: key.label,
      description: occupancy.kind === 'script' ? occupancy.label : 'Available',
    });
  }
}

async function promptCustomShortcut(
  script: NpmScriptInfo,
  packageKey: string,
  store: ShortcutStoreLike,
  occupancyInput: OccupancyInput,
): Promise<'assigned' | 'cleared' | 'cancelled'> {
  const value = await vscode.window.showInputBox({
    title: 'Custom Shortcut',
    prompt: 'Enter a keybinding to run this script',
    placeHolder: 'ctrl+shift+b',
    validateInput: (raw) => {
      const parsed = parseKeybinding(raw);
      if (!parsed.ok) {
        return parsed.error;
      }
      const occupancy = inspectKey(parsed.keyId, occupancyInput);
      if (isHardBlock(occupancy)) {
        return occupancy.label;
      }
      return undefined;
    },
  });
  if (value === undefined) {
    return 'cancelled';
  }
  const parsed = parseKeybinding(value);
  if (!parsed.ok) {
    return 'cancelled';
  }
  return assignWithConfirm(parsed.keyId, packageKey, script, store, occupancyInput);
}

async function assignWithConfirm(
  keyId: string,
  packageKey: string,
  script: NpmScriptInfo,
  store: ShortcutStoreLike,
  occupancyInput: OccupancyInput,
): Promise<'assigned' | 'cleared' | 'cancelled'> {
  const current = findShortcutForScript(occupancyInput.bindings, packageKey, script.name);
  if (current?.keyId === keyId) {
    return 'cancelled';
  }

  const occupancy = inspectKey(keyId, occupancyInput);
  if (isHardBlock(occupancy)) {
    await vscode.window.showErrorMessage(`${formatKeyLabel(keyId)}: ${occupancy.label}`);
    return 'cancelled';
  }

  if (occupancy.kind !== 'free') {
    const confirmed = await confirmConflict(keyId, occupancy.label, `${packageKey}::${script.name}`);
    if (!confirmed) {
      return 'cancelled';
    }
  }

  await store.assign(keyId, packageKey, script.name);
  return 'assigned';
}

async function confirmConflict(keyId: string, occupancyLabel: string, scriptLabel: string): Promise<boolean> {
  const result = await vscode.window.showWarningMessage(
    `${formatKeyLabel(keyId)} is already used (${occupancyLabel}). Bind it to ${scriptLabel} anyway?`,
    { modal: true },
    'Bind anyway',
  );
  return result === 'Bind anyway';
}
