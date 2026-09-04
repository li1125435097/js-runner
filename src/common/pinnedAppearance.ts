import * as vscode from 'vscode';

export const DEFAULT_PINNED_FOREGROUND = '#46ee37';
export const PINNED_FOREGROUND_COLOR_ID = 'jsRunner.pinnedForeground';
export const PINNED_URI_SCHEME = 'js-runner-pin';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function normalizeHex(value: string): string {
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return value;
}

export function getPinnedForeground(): string {
  const raw = vscode.workspace
    .getConfiguration('jsRunner')
    .get<string>('pinnedForeground', DEFAULT_PINNED_FOREGROUND)
    ?.trim();
  return raw && HEX_COLOR.test(raw) ? normalizeHex(raw) : DEFAULT_PINNED_FOREGROUND;
}

export function pinnedForegroundThemeColor(): vscode.ThemeColor {
  return new vscode.ThemeColor(PINNED_FOREGROUND_COLOR_ID);
}

/** vscode-codicons `package` glyph; fill is baked in so selection CSS cannot recolor it. */
const PACKAGE_ICON_PATH =
  'M8.61 1H7.4L1 4.52v6.5L7.4 15h1.21L15 11.02v-6.5L8.61 1zM8 2.11l5.02 2.76L8 7.63 2.98 4.87 8 2.11zM2 5.62l5.5 3.03v5.52L2 11.15V5.62zm6.5 8.55v-5.52L14 5.62v5.53l-5.5 3.02z';

export function pinnedPackageIconUri(): vscode.Uri {
  const color = getPinnedForeground();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="${color}" fill-rule="evenodd" clip-rule="evenodd" d="${PACKAGE_ICON_PATH}"/></svg>`;
  return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

export function pinnedPackageUri(packageJsonPath: string): vscode.Uri {
  return vscode.Uri.parse(`${PINNED_URI_SCHEME}:package/${encodeURIComponent(packageJsonPath)}`);
}

export function pinnedScriptUri(packageJsonPath: string, scriptName: string): vscode.Uri {
  return vscode.Uri.parse(
    `${PINNED_URI_SCHEME}:script/${encodeURIComponent(packageJsonPath)}/${encodeURIComponent(scriptName)}`,
  );
}

export class PinnedDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== PINNED_URI_SCHEME) {
      return undefined;
    }
    return {
      color: pinnedForegroundThemeColor(),
      propagate: false,
    };
  }
}

export async function syncPinnedForegroundColorCustomization(): Promise<void> {
  const inspected = vscode.workspace.getConfiguration('jsRunner').inspect<string>('pinnedForeground');
  const hasExplicit =
    inspected?.globalValue !== undefined ||
    inspected?.workspaceValue !== undefined ||
    inspected?.workspaceFolderValue !== undefined;
  if (!hasExplicit) {
    return;
  }

  const color = getPinnedForeground();
  const workbench = vscode.workspace.getConfiguration('workbench');
  const colorsInspect = workbench.inspect<Record<string, unknown>>('colorCustomizations');
  const useWorkspace =
    inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined;
  const target = useWorkspace
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  const existing = useWorkspace ? colorsInspect?.workspaceValue : colorsInspect?.globalValue;
  const next = { ...(existing ?? {}) };
  if (next[PINNED_FOREGROUND_COLOR_ID] === color) {
    return;
  }
  next[PINNED_FOREGROUND_COLOR_ID] = color;
  await workbench.update('colorCustomizations', next, target);
}

const LIST_ACTIVE_SELECTION_FOREGROUND = 'list.activeSelectionForeground';

let selectionForegroundApplied = false;
let previousSelectionForeground: unknown;
let selectionForegroundQueue: Promise<void> = Promise.resolve();

function colorCustomizationsTarget(): {
  target: vscode.ConfigurationTarget;
  existing: Record<string, unknown>;
} {
  const workbench = vscode.workspace.getConfiguration('workbench');
  const colorsInspect = workbench.inspect<Record<string, unknown>>('colorCustomizations');
  const pinInspected = vscode.workspace.getConfiguration('jsRunner').inspect<string>('pinnedForeground');
  const useWorkspace =
    pinInspected?.workspaceValue !== undefined ||
    pinInspected?.workspaceFolderValue !== undefined ||
    colorsInspect?.workspaceValue !== undefined;
  const target = useWorkspace
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  const existing = { ...((useWorkspace ? colorsInspect?.workspaceValue : colorsInspect?.globalValue) ?? {}) };
  return { target, existing };
}

async function writePinnedListSelectionForeground(enabled: boolean): Promise<void> {
  const { target, existing } = colorCustomizationsTarget();
  const next = { ...existing };

  if (enabled) {
    const color = getPinnedForeground();
    if (!selectionForegroundApplied) {
      previousSelectionForeground = next[LIST_ACTIVE_SELECTION_FOREGROUND];
      selectionForegroundApplied = true;
    }
    if (next[LIST_ACTIVE_SELECTION_FOREGROUND] === color) {
      return;
    }
    next[LIST_ACTIVE_SELECTION_FOREGROUND] = color;
  } else {
    if (!selectionForegroundApplied) {
      return;
    }
    selectionForegroundApplied = false;
    if (previousSelectionForeground === undefined) {
      delete next[LIST_ACTIVE_SELECTION_FOREGROUND];
    } else {
      next[LIST_ACTIVE_SELECTION_FOREGROUND] = previousSelectionForeground;
    }
    previousSelectionForeground = undefined;
    if (next[LIST_ACTIVE_SELECTION_FOREGROUND] === existing[LIST_ACTIVE_SELECTION_FOREGROUND]) {
      return;
    }
  }

  const value = Object.keys(next).length > 0 ? next : undefined;
  await vscode.workspace.getConfiguration('workbench').update('colorCustomizations', value, target);
}

/** Keep pinned package labels green while selected by matching list selection foreground to the pin color. */
export function setPinnedListSelectionForeground(enabled: boolean): Promise<void> {
  selectionForegroundQueue = selectionForegroundQueue.then(
    () => writePinnedListSelectionForeground(enabled),
    () => writePinnedListSelectionForeground(enabled),
  );
  return selectionForegroundQueue;
}
