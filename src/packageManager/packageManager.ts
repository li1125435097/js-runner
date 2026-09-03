import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  buildInstallCommand,
  buildRunScriptCommand,
  formatScriptLabel,
  getManagerDisplayLabel,
  isKnownPackageManager,
  KnownPackageManager,
  quoteScriptName,
} from '../common/packageManagerCommands';
import { getPackageManagerSettings } from './packageManagerConfig';

export type { KnownPackageManager };
export {
  buildInstallCommand,
  buildRunScriptCommand,
  formatScriptLabel,
  getManagerDisplayLabel,
  isKnownPackageManager,
  quoteScriptName,
};

const KNOWN_MANAGERS = new Set<string>(['npm', 'yarn', 'pnpm', 'bun']);

const LOCKFILE_MAP: Array<[string, KnownPackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

const detectCache = new Map<string, KnownPackageManager>();

/** @internal Test hook. */
export function clearPackageManagerCacheForTest(): void {
  detectCache.clear();
}

function getWorkspaceRoot(packageJsonPath: string): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(packageJsonPath),
  );
  return workspaceFolder?.uri.fsPath ?? path.dirname(packageJsonPath);
}

function readPackageManagerField(packageJsonPath: string): KnownPackageManager | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      packageManager?: string;
    };
    if (!pkg.packageManager) {
      return undefined;
    }

    const name = pkg.packageManager.split('@')[0]?.trim().toLowerCase();
    if (name && KNOWN_MANAGERS.has(name)) {
      return name as KnownPackageManager;
    }
  } catch {
    // ignore invalid package.json
  }

  return undefined;
}

function detectFromLockfiles(
  packageDir: string,
  workspaceRoot: string,
): KnownPackageManager | undefined {
  let dir = packageDir;
  const normalizedStop = path.normalize(workspaceRoot);

  while (true) {
    for (const [file, manager] of LOCKFILE_MAP) {
      if (fs.existsSync(path.join(dir, file))) {
        return manager;
      }
    }

    if (path.normalize(dir) === normalizedStop) {
      break;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return undefined;
}

/** Auto-detect package manager, ignoring user overrides. */
export function detectPackageManager(packageJsonPath: string): KnownPackageManager {
  const cached = detectCache.get(packageJsonPath);
  if (cached) {
    return cached;
  }

  const fromField = readPackageManagerField(packageJsonPath);
  if (fromField) {
    detectCache.set(packageJsonPath, fromField);
    return fromField;
  }

  const packageDir = path.dirname(packageJsonPath);
  const workspaceRoot = getWorkspaceRoot(packageJsonPath);
  const fromLockfile = detectFromLockfiles(packageDir, workspaceRoot);
  const resolved = fromLockfile ?? 'npm';
  detectCache.set(packageJsonPath, resolved);
  return resolved;
}

function getGlobalManagerOverride(): string | undefined {
  const globalSetting = vscode.workspace
    .getConfiguration('jsRunner')
    .get<string>('packageManager', 'auto');

  if (globalSetting && globalSetting !== 'auto' && KNOWN_MANAGERS.has(globalSetting)) {
    return globalSetting;
  }

  return undefined;
}

/** Resolve the CLI name used to run/install scripts. */
export function resolvePackageManager(packageJsonPath: string): string {
  const settings = getPackageManagerSettings(packageJsonPath);

  if (settings.manager === 'auto') {
    const globalOverride = getGlobalManagerOverride();
    if (globalOverride) {
      return globalOverride;
    }
    return detectPackageManager(packageJsonPath);
  }

  return settings.manager;
}
