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

/** Workspace root packages use "." — empty string keys break VS Code config read/write. */
export const ROOT_PACKAGE_KEY = '.';

export function getRelativePackageKey(packageJsonPath: string): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(packageJsonPath),
  );
  if (!workspaceFolder) {
    return ROOT_PACKAGE_KEY;
  }

  const relative = path.relative(workspaceFolder.uri.fsPath, path.dirname(packageJsonPath));
  if (!relative || relative === '.') {
    return ROOT_PACKAGE_KEY;
  }

  return relative.replace(/\\/g, '/');
}

function getSettingsMap(): Record<string, Partial<PackageManagerSettings>> {
  return vscode.workspace.getConfiguration('jsRunner').get<
    Record<string, Partial<PackageManagerSettings>>
  >('packageManagerSettings', {});
}

export function getPackageManagerSettings(packageJsonPath: string): PackageManagerSettings {
  const key = getRelativePackageKey(packageJsonPath);
  const allSettings = getSettingsMap();
  const entry = allSettings[key] ?? {};

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
  if (!workspaceFolder) {
    throw new Error('JS Runner: package.json is not inside an open workspace folder.');
  }

  const key = getRelativePackageKey(packageJsonPath);
  const config = vscode.workspace.getConfiguration('jsRunner');
  const current = config.get<Record<string, PackageManagerSettings>>(
    'packageManagerSettings',
    {},
  );
  const updated = {
    ...current,
    [key]: {
      ...(current[key] ?? DEFAULT_SETTINGS),
      ...patch,
    },
  };

  await config.update('packageManagerSettings', updated, vscode.ConfigurationTarget.Workspace);
}
