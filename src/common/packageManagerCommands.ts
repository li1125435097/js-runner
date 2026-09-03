export type KnownPackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

const KNOWN_MANAGERS = new Set<string>(['npm', 'yarn', 'pnpm', 'bun']);

export function isKnownPackageManager(value: string): value is KnownPackageManager {
  return KNOWN_MANAGERS.has(value);
}

export function quoteScriptName(name: string): string {
  return name.includes(' ') ? `"${name.replace(/"/g, '\\"')}"` : name;
}

export function buildRunScriptCommand(pm: string, scriptName: string): string {
  return `${pm} run ${quoteScriptName(scriptName)}`;
}

export function buildInstallCommand(pm: string): string {
  return `${pm} install`;
}

export function formatScriptLabel(pm: string, scriptName: string): string {
  return `${pm}: ${scriptName}`;
}

export function getManagerDisplayLabel(
  managerSetting: string,
  detectedManager: KnownPackageManager,
  resolvedManager: string,
): string {
  if (managerSetting === 'auto') {
    return `auto (${detectedManager})`;
  }

  if (isKnownPackageManager(managerSetting)) {
    return managerSetting;
  }

  return resolvedManager;
}
