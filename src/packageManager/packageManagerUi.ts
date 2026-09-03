import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  buildInstallCommand,
  resolvePackageManager,
} from './packageManager';
import {
  getPackageManagerSettings,
  savePackageManagerSettings,
} from './packageManagerConfig';
import { resolveRegistryUrl, writeRegistryToNpmrc } from './registryConfig';
import { getRegistryDisplayLabel, REGISTRY_PRESETS } from '../common/registryPresets';

const MANAGER_OPTIONS = [
  { label: 'auto', description: 'Detect from packageManager field and lockfiles' },
  { label: 'npm', description: 'Use npm' },
  { label: 'yarn', description: 'Use Yarn' },
  { label: 'pnpm', description: 'Use pnpm' },
  { label: 'bun', description: 'Use Bun' },
  { label: 'Custom...', description: 'Enter a custom package manager CLI name' },
];

const REGISTRY_OPTIONS = [
  { label: 'auto', description: 'Use registry from .npmrc or npm official default' },
  ...REGISTRY_PRESETS.map((preset) => ({
    label: preset.id,
    description: `${preset.label} — ${preset.url}`,
  })),
  { label: 'Custom...', description: 'Enter a custom registry URL' },
];

function resolvePackageJsonPath(item: unknown): string {
  if (typeof item === 'string' && item.length > 0) {
    return item;
  }

  if (!item || typeof item !== 'object') {
    throw new Error('JS Runner: missing package.json path.');
  }

  const candidate = item as {
    packageJsonPath?: string;
    group?: { packageJsonPath?: string };
    command?: { arguments?: unknown[] };
  };

  if (candidate.packageJsonPath) {
    return candidate.packageJsonPath;
  }
  if (candidate.group?.packageJsonPath) {
    return candidate.group.packageJsonPath;
  }

  const argument = candidate.command?.arguments?.[0];
  if (typeof argument === 'string' && argument.length > 0) {
    return argument;
  }

  throw new Error('JS Runner: missing package.json path.');
}

async function runPackageManagerAction(
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(message);
  }
}

export async function selectPackageManager(
  item: unknown,
  refresh?: () => void,
): Promise<void> {
  await runPackageManagerAction(async () => {
    const packageJsonPath = resolvePackageJsonPath(item);
    const picked = await vscode.window.showQuickPick(MANAGER_OPTIONS, {
      title: 'Select Package Manager',
      placeHolder: 'Choose how scripts are run for this package',
    });

    if (!picked) {
      return;
    }

    if (picked.label === 'Custom...') {
      const custom = await vscode.window.showInputBox({
        title: 'Custom Package Manager',
        prompt: 'Enter the CLI name used to run scripts (e.g. npm, pnpm)',
        validateInput: (value) => {
          const trimmed = value.trim();
          if (!trimmed) {
            return 'Package manager name is required';
          }
          if (!/^[\w.-]+$/.test(trimmed)) {
            return 'Use letters, numbers, dots, or hyphens only';
          }
          return undefined;
        },
      });
      if (!custom) {
        return;
      }
      await savePackageManagerSettings(packageJsonPath, { manager: custom.trim() });
    } else {
      await savePackageManagerSettings(packageJsonPath, { manager: picked.label });
    }

    refresh?.();
  });
}

export async function selectRegistry(
  item: unknown,
  refresh?: () => void,
): Promise<void> {
  await runPackageManagerAction(async () => {
    const packageJsonPath = resolvePackageJsonPath(item);
    const picked = await vscode.window.showQuickPick(REGISTRY_OPTIONS, {
      title: 'Select Registry',
      placeHolder: 'Choose npm registry for install',
    });

    if (!picked) {
      return;
    }

    if (picked.label === 'Custom...') {
      const custom = await vscode.window.showInputBox({
        title: 'Custom Registry',
        prompt: 'Enter registry URL',
        placeHolder: 'https://registry.npmmirror.com',
        validateInput: (value) => {
          const trimmed = value.trim();
          if (!trimmed) {
            return 'Registry URL is required';
          }
          if (!/^https?:\/\//i.test(trimmed)) {
            return 'Enter a valid http(s) URL';
          }
          return undefined;
        },
      });
      if (!custom) {
        return;
      }
      await savePackageManagerSettings(packageJsonPath, { registry: custom.trim() });
      writeRegistryToNpmrc(path.dirname(packageJsonPath), custom.trim());
    } else {
      await savePackageManagerSettings(packageJsonPath, { registry: picked.label });
      if (picked.label !== 'auto') {
        const preset = REGISTRY_PRESETS.find((entry) => entry.id === picked.label);
        if (preset) {
          writeRegistryToNpmrc(path.dirname(packageJsonPath), preset.url);
        }
      }
    }

    refresh?.();
  });
}

export async function installDependencies(
  item: unknown,
  refresh?: () => void,
): Promise<void> {
  const packageJsonPath = resolvePackageJsonPath(item);
  const packageDir = path.dirname(packageJsonPath);
  const nodeModulesPath = path.join(packageDir, 'node_modules');
  const pm = resolvePackageManager(packageJsonPath);
  const settings = getPackageManagerSettings(packageJsonPath);
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(packageJsonPath))
    ?.uri.fsPath;
  const registryUrl = resolveRegistryUrl(packageJsonPath, settings.registry, workspaceRoot);

  if (fs.existsSync(nodeModulesPath)) {
    const confirm = await vscode.window.showWarningMessage(
      'node_modules already exists. Delete existing dependencies and reinstall?',
      { modal: true },
      'Delete and Reinstall',
    );
    if (confirm !== 'Delete and Reinstall') {
      return;
    }
    fs.rmSync(nodeModulesPath, { recursive: true, force: true });
  }

  writeRegistryToNpmrc(packageDir, registryUrl);

  const terminal = vscode.window.createTerminal({
    name: `${pm}: install`,
    cwd: packageDir,
  });
  terminal.show();
  terminal.sendText(buildInstallCommand(pm));
  refresh?.();
}
