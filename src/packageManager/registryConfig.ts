import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_REGISTRY_URL,
  findRegistryPresetByUrl,
  getRegistryPresetById,
  normalizeRegistryUrl,
} from '../common/registryPresets';

const REGISTRY_LINE = /^registry\s*=\s*(.+)$/im;

function parseRegistryFromNpmrcContent(content: string): string | undefined {
  const match = content.match(REGISTRY_LINE);
  if (!match?.[1]) {
    return undefined;
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

/** Walk from packageDir up to stopDir looking for registry= in .npmrc */
export function readRegistryFromNpmrc(
  packageDir: string,
  stopDir?: string,
): string | undefined {
  let dir = packageDir;
  const normalizedStop = stopDir ? path.normalize(stopDir) : undefined;

  while (true) {
    const npmrcPath = path.join(dir, '.npmrc');
    if (fs.existsSync(npmrcPath)) {
      try {
        const content = fs.readFileSync(npmrcPath, 'utf-8');
        const registry = parseRegistryFromNpmrcContent(content);
        if (registry) {
          return registry;
        }
      } catch {
        // ignore unreadable .npmrc
      }
    }

    if (normalizedStop && path.normalize(dir) === normalizedStop) {
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

export function writeRegistryToNpmrc(packageDir: string, url: string): void {
  const npmrcPath = path.join(packageDir, '.npmrc');
  let content = '';

  if (fs.existsSync(npmrcPath)) {
    content = fs.readFileSync(npmrcPath, 'utf-8');
  }

  if (REGISTRY_LINE.test(content)) {
    content = content.replace(REGISTRY_LINE, `registry=${url}`);
  } else {
    const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    content = `${content}${suffix}registry=${url}\n`;
  }

  fs.writeFileSync(npmrcPath, content, 'utf-8');
}

export function resolveRegistryUrl(
  packageJsonPath: string,
  registrySetting: string,
  workspaceRoot?: string,
): string {
  const packageDir = path.dirname(packageJsonPath);

  if (registrySetting === 'auto') {
    return (
      readRegistryFromNpmrc(packageDir, workspaceRoot) ?? DEFAULT_REGISTRY_URL
    );
  }

  const preset = getRegistryPresetById(registrySetting);
  if (preset) {
    return preset.url;
  }

  if (/^https?:\/\//i.test(registrySetting)) {
    return registrySetting;
  }

  const presetByUrl = findRegistryPresetByUrl(registrySetting);
  if (presetByUrl) {
    return presetByUrl.url;
  }

  return DEFAULT_REGISTRY_URL;
}

export function getRegistrySettingFromUrl(url: string): string {
  const preset = findRegistryPresetByUrl(url);
  return preset?.id ?? url;
}

export function normalizeRegistryForCompare(url: string): string {
  return normalizeRegistryUrl(url);
}
