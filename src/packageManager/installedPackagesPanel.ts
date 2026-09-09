import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  detectPackageManager,
  resolvePackageManager,
} from './packageManager';
import { getPackageManagerSettings } from './packageManagerConfig';
import { resolveRegistryUrl } from './registryConfig';
import { getRegistryDisplayLabel } from '../common/registryPresets';
import {
  ADD_VERSION_VALUE,
  canSwitchInstalledPackage,
  installPackageVersionToCache,
  listCachedVersions,
  seedCurrentInstalledVersion,
  switchInstalledVersion,
} from './packageVersionCache';
import { fetchRegistryPackageVersions, RegistryPackageVersions } from './registryClient';

export type DependencyType = 'prod' | 'dev' | 'peer' | 'optional';

export interface InstalledPackageRow {
  name: string;
  type: DependencyType;
  declared: string;
  installed: string;
  modulePath?: string;
  cachedVersions: string[];
  canSwitch: boolean;
}

export interface InstalledPackagesSummary {
  packageName: string;
  packageJsonPath: string;
  packageManager: string;
  registryUrl: string;
  registryLabel: string;
  rows: InstalledPackageRow[];
}

const TYPE_LABELS: Record<DependencyType, string> = {
  prod: 'Production',
  dev: 'Development',
  peer: 'Peer',
  optional: 'Optional',
};

function readInstalledVersion(packageDir: string, name: string): string {
  const modulePackageJson = path.join(packageDir, 'node_modules', name, 'package.json');
  if (!fs.existsSync(modulePackageJson)) {
    return '—';
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(modulePackageJson, 'utf-8')) as { version?: string };
    return pkg.version ?? '—';
  } catch {
    return '—';
  }
}

function addDependencyRows(
  rows: InstalledPackageRow[],
  packageDir: string,
  deps: Record<string, string> | undefined,
  type: DependencyType,
): void {
  if (!deps) {
    return;
  }

  for (const [name, declared] of Object.entries(deps)) {
    const modulePath = path.join(packageDir, 'node_modules', name);
    const canSwitch = canSwitchInstalledPackage(packageDir, name);
    if (canSwitch) {
      try {
        seedCurrentInstalledVersion(packageDir, name);
      } catch {
        // keep listing even if the current copy cannot be cached
      }
    }

    rows.push({
      name,
      type,
      declared,
      installed: readInstalledVersion(packageDir, name),
      modulePath: fs.existsSync(modulePath) ? modulePath : undefined,
      cachedVersions: canSwitch ? listCachedVersions(packageDir, name) : [],
      canSwitch,
    });
  }
}

export function buildInstalledPackagesSummary(packageJsonPath: string): InstalledPackagesSummary {
  const packageDir = path.dirname(packageJsonPath);
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(packageJsonPath))
    ?.uri.fsPath;
  const settings = getPackageManagerSettings(packageJsonPath);
  const detected = detectPackageManager(packageJsonPath);
  const resolvedManager = resolvePackageManager(packageJsonPath);
  const registryUrl = resolveRegistryUrl(packageJsonPath, settings.registry, workspaceRoot);
  const registryLabel = getRegistryDisplayLabel(settings.registry, registryUrl);

  let pkg: {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  } = {};

  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  } catch {
    // keep empty summary
  }

  const rows: InstalledPackageRow[] = [];
  addDependencyRows(rows, packageDir, pkg.dependencies, 'prod');
  addDependencyRows(rows, packageDir, pkg.devDependencies, 'dev');
  addDependencyRows(rows, packageDir, pkg.peerDependencies, 'peer');
  addDependencyRows(rows, packageDir, pkg.optionalDependencies, 'optional');
  rows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    packageName: pkg.name ?? path.basename(packageDir),
    packageJsonPath,
    packageManager: settings.manager === 'auto' ? `auto (${detected})` : resolvedManager,
    registryUrl,
    registryLabel,
    rows,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInstalledCell(row: InstalledPackageRow): string {
  if (!row.canSwitch) {
    return `<td>${escapeHtml(row.installed)}</td>`;
  }

  const options: string[] = [];
  const seen = new Set<string>();
  if (row.installed === '—' && !row.cachedVersions.includes(row.installed)) {
    options.push('<option value="" selected disabled>—</option>');
  }

  const versions = row.installed !== '—' && !row.cachedVersions.includes(row.installed)
    ? [row.installed, ...row.cachedVersions]
    : row.cachedVersions;

  for (const version of versions) {
    if (seen.has(version)) {
      continue;
    }
    seen.add(version);
    const selected = version === row.installed ? ' selected' : '';
    options.push(
      `<option value="${escapeHtml(version)}"${selected}>${escapeHtml(version)}</option>`,
    );
  }

  options.push(`<option value="${ADD_VERSION_VALUE}">Add version...</option>`);
  return `<td><select class="version-select" data-name="${escapeHtml(row.name)}" data-current="${escapeHtml(row.installed)}">${options.join('')}</select></td>`;
}

function renderHtml(summary: InstalledPackagesSummary, filter: DependencyType | 'all'): string {
  const filteredRows =
    filter === 'all' ? summary.rows : summary.rows.filter((row) => row.type === filter);

  const rowsHtml = filteredRows
    .map(
      (row) => `<tr data-path="${escapeHtml(row.modulePath ?? '')}">
        <td><button class="pkg-link" data-path="${escapeHtml(row.modulePath ?? '')}">${escapeHtml(row.name)}</button></td>
        <td>${escapeHtml(TYPE_LABELS[row.type])}</td>
        <td>${escapeHtml(row.declared)}</td>
        ${renderInstalledCell(row)}
      </tr>`,
    )
    .join('');

  const filterOptions = [
    ['all', 'All'],
    ['prod', 'Production'],
    ['dev', 'Development'],
    ['peer', 'Peer'],
    ['optional', 'Optional'],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${filter === value ? ' selected' : ''}>${label}</option>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Installed Packages</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 16px;
      color-scheme: light;
    }
    body.vscode-dark,
    body.vscode-high-contrast {
      color-scheme: dark;
    }
    h1 { font-size: 1.2rem; margin: 0 0 8px; }
    .meta { color: var(--vscode-descriptionForeground); margin-bottom: 16px; line-height: 1.5; }
    .toolbar { margin-bottom: 12px; display: flex; gap: 12px; align-items: center; }
    .hint { color: var(--vscode-descriptionForeground); margin: 0 0 12px; line-height: 1.4; font-size: 0.9rem; }
    select {
      font-family: inherit;
      font-size: inherit;
      background-color: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      padding: 4px 8px;
    }
    select option {
      background-color: var(--vscode-dropdown-listBackground, var(--vscode-dropdown-background));
      color: var(--vscode-dropdown-foreground);
    }
    button {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-panel-border);
      padding: 4px 8px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    .pkg-link {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      padding: 0;
    }
    .empty { color: var(--vscode-descriptionForeground); padding: 24px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(summary.packageName)}</h1>
  <div class="meta">
    Package manager: ${escapeHtml(summary.packageManager)}<br />
    Registry: ${escapeHtml(summary.registryLabel)}<br />
    Dependencies: ${summary.rows.length}
  </div>
  <div class="toolbar">
    <label>Type
      <select id="typeFilter">${filterOptions}</select>
    </label>
  </div>
  <p class="hint">Switching versions only updates node_modules. package.json is left unchanged. Install Dependencies (npm, yarn, pnpm, or bun) may restore the lockfile version.</p>
  ${
    filteredRows.length === 0
      ? '<div class="empty">No dependencies found.</div>'
      : `<table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Declared</th><th>Installed(Currently used version)</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`
  }
  <script>
    const vscode = acquireVsCodeApi();
    const addVersionValue = ${JSON.stringify(ADD_VERSION_VALUE)};
    document.getElementById('typeFilter').addEventListener('change', (event) => {
      vscode.postMessage({ type: 'filter', value: event.target.value });
    });
    document.querySelectorAll('.pkg-link').forEach((button) => {
      button.addEventListener('click', () => {
        const modulePath = button.getAttribute('data-path');
        if (modulePath) {
          vscode.postMessage({ type: 'reveal', path: modulePath });
        }
      });
    });
    document.querySelectorAll('.version-select').forEach((select) => {
      select.addEventListener('change', (event) => {
        const target = event.target;
        const name = target.getAttribute('data-name');
        const value = target.value;
        if (!name) {
          return;
        }
        if (value === addVersionValue) {
          target.value = target.getAttribute('data-current') || '';
          vscode.postMessage({ type: 'addVersion', name });
          return;
        }
        vscode.postMessage({ type: 'switchVersion', name, version: value });
      });
    });
  </script>
</body>
</html>`;
}

function findRow(
  summary: InstalledPackagesSummary,
  name: string,
): InstalledPackageRow | undefined {
  return summary.rows.find((row) => row.name === name);
}

function buildVersionQuickPickItems(
  metadata: RegistryPackageVersions,
): Array<vscode.QuickPickItem & { version: string }> {
  const items: Array<vscode.QuickPickItem & { version: string }> = [];
  const seen = new Set<string>();

  for (const [tag, version] of Object.entries(metadata.distTags)) {
    if (typeof version !== 'string' || seen.has(version)) {
      continue;
    }
    seen.add(version);
    items.push({ label: version, description: tag, version });
  }

  for (const version of metadata.versions) {
    if (seen.has(version)) {
      continue;
    }
    seen.add(version);
    items.push({ label: version, version });
  }

  return items;
}

async function handleSwitchVersion(packageJsonPath: string, name: string, version: string): Promise<void> {
  const summary = buildInstalledPackagesSummary(packageJsonPath);
  const row = findRow(summary, name);
  if (!row?.canSwitch) {
    return;
  }

  if (version === ADD_VERSION_VALUE) {
    return;
  }

  if (!row.cachedVersions.includes(version) && row.installed !== version) {
    await vscode.window.showErrorMessage(`JS Runner: ${name}@${version} is not in the local version cache.`);
    return;
  }

  const packageDir = path.dirname(packageJsonPath);
  switchInstalledVersion(packageDir, name, version);
}

async function handleAddVersion(packageJsonPath: string, name: string): Promise<void> {
  const summary = buildInstalledPackagesSummary(packageJsonPath);
  const row = findRow(summary, name);
  if (!row?.canSwitch) {
    return;
  }

  const metadata = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Fetching versions for ${name}`,
    },
    async () => fetchRegistryPackageVersions(summary.registryUrl, name),
  );

  const items = buildVersionQuickPickItems(metadata);
  if (items.length === 0) {
    await vscode.window.showErrorMessage(`JS Runner: no versions found for ${name}.`);
    return;
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: `Add version of ${name}`,
    placeHolder: 'Select a version to cache locally',
    matchOnDescription: true,
  });
  if (!picked) {
    return;
  }

  const packageDir = path.dirname(packageJsonPath);
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Caching ${name}@${picked.version}`,
    },
    async () => {
      await installPackageVersionToCache(packageDir, name, picked.version, summary.registryUrl);
    },
  );
}

const openPanels = new Map<string, vscode.WebviewPanel>();

export function viewInstalledPackages(
  packageJsonPath: string,
  context: vscode.ExtensionContext,
): void {
  const existing = openPanels.get(packageJsonPath);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Active);
    return;
  }

  const summary = buildInstalledPackagesSummary(packageJsonPath);
  let currentFilter: DependencyType | 'all' = 'all';

  const panel = vscode.window.createWebviewPanel(
    'jsRunnerInstalledPackages',
    `Packages: ${summary.packageName}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const updatePanel = (): void => {
    const latest = buildInstalledPackagesSummary(packageJsonPath);
    panel.webview.html = renderHtml(latest, currentFilter);
  };

  updatePanel();
  openPanels.set(packageJsonPath, panel);

  panel.onDidDispose(() => {
    openPanels.delete(packageJsonPath);
  });

  panel.webview.onDidReceiveMessage(async (message: {
    type: string;
    value?: string;
    path?: string;
    name?: string;
    version?: string;
  }) => {
    if (message.type === 'filter' && message.value) {
      currentFilter = message.value as DependencyType | 'all';
      updatePanel();
      return;
    }

    if (message.type === 'reveal' && message.path && fs.existsSync(message.path)) {
      await vscode.commands.executeCommand(
        'revealInExplorer',
        vscode.Uri.file(message.path),
      );
      return;
    }

    if (message.type === 'switchVersion' && message.name && message.version) {
      try {
        await handleSwitchVersion(packageJsonPath, message.name, message.version);
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(text);
      }
      updatePanel();
      return;
    }

    if (message.type === 'addVersion' && message.name) {
      try {
        await handleAddVersion(packageJsonPath, message.name);
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(text);
      }
      updatePanel();
    }
  });

  context.subscriptions.push(panel);
}

export function filterInstalledPackageRows(
  rows: InstalledPackageRow[],
  filter: DependencyType | 'all',
): InstalledPackageRow[] {
  if (filter === 'all') {
    return rows;
  }
  return rows.filter((row) => row.type === filter);
}
