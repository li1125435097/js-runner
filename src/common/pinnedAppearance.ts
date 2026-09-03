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
