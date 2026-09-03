import * as path from 'path';
import * as vscode from 'vscode';

export interface PackageManagerSettings {
  manager: string;
  registry: string;
}

const DEFAULT_SETTINGS: PackageManagerSettings = {
  manager: 'auto',
  registry: 'auto',
};

export function getRelativePackageKey(packageJsonPath: string): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(packageJsonPath),
  );
  if (!workspaceFolder) {
    return '';
  }

  const relative = path.relative(workspaceFolder.uri.fsPath, path.dirname(packageJsonPath));
  if (!relative || relative === '.') {
    return '';
  }

  return relative.replace(/\\/g, '/');
}

function getSettingsMap(): Record<string, Partial<PackageManagerSettings>> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const config = workspaceFolder
    ? vscode.workspace.getConfiguration('jsRunner', workspaceFolder.uri)
    : vscode.workspace.getConfiguration('jsRunner');

  return config.get<Record<string, Partial<PackageManagerSettings>>>(
    'packageManagerSettings',
    {},
  );
}

export function getPackageManagerSettings(packageJsonPath: string): PackageManagerSettings {
  const key = getRelativePackageKey(packageJsonPath);
  const allSettings = getSettingsMap();
  const entry = allSettings[key] ?? allSettings[''] ?? {};

  return {
    manager: entry.manager ?? DEFAULT_SETTINGS.manager,
    registry: entry.registry ?? DEFAULT_SETTINGS.registry,
  };
}

export async function savePackageManagerSettings(
  packageJsonPath: string,
  patch: Partial<PackageManagerSettings>,
): Promise<void> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(packageJsonPath),
  );
  const key = getRelativePackageKey(packageJsonPath);
  const config = workspaceFolder
    ? vscode.workspace.getConfiguration('jsRunner', workspaceFolder.uri)
    : vscode.workspace.getConfiguration('jsRunner');
  const current = config.get<Record<string, PackageManagerSettings>>(
    'packageManagerSettings',
    {},
  );
  const existing = current[key] ?? DEFAULT_SETTINGS;
  const updated = {
    ...current,
    [key]: {
      ...existing,
      ...patch,
    },
  };
  const target = workspaceFolder
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.ConfigurationTarget.Workspace;

  await config.update('packageManagerSettings', updated, target);
}
