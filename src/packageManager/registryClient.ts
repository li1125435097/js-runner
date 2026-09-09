import * as http from 'http';
import * as https from 'https';

export interface RegistryPackageVersions {
  versions: string[];
  distTags: Record<string, string>;
}

export type RegistryHttpGet = (url: string) => Promise<string>;

let httpGetOverride: RegistryHttpGet | undefined;

/** @internal Test hook. */
export function setRegistryHttpGetForTest(getter: RegistryHttpGet | undefined): void {
  httpGetOverride = getter;
}

export function buildRegistryPackageMetadataUrl(registryUrl: string, packageName: string): string {
  const base = registryUrl.trim().replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(packageName)}`;
}

export function compareRegistryVersionsDescending(a: string, b: string): number {
  return compareRegistryVersionsAscending(b, a);
}

function compareRegistryVersionsAscending(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  const length = Math.max(parsedA.nums.length, parsedB.nums.length);
  for (let index = 0; index < length; index += 1) {
    const left = parsedA.nums[index] ?? 0;
    const right = parsedB.nums[index] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }

  if (parsedA.pre === parsedB.pre) {
    return a.localeCompare(b);
  }
  if (!parsedA.pre) {
    return 1;
  }
  if (!parsedB.pre) {
    return -1;
  }
  return parsedA.pre.localeCompare(parsedB.pre);
}

function parseVersion(version: string): { nums: number[]; pre: string } {
  const withoutBuild = version.split('+')[0] ?? version;
  const dash = withoutBuild.indexOf('-');
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const pre = dash === -1 ? '' : withoutBuild.slice(dash + 1);
  const nums = core.split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    return Number.isFinite(value) ? value : 0;
  });
  return { nums, pre };
}

export function parseRegistryPackageMetadata(payload: unknown): RegistryPackageVersions {
  if (!payload || typeof payload !== 'object') {
    throw new Error('JS Runner: invalid registry metadata.');
  }

  const data = payload as {
    versions?: Record<string, unknown>;
    'dist-tags'?: Record<string, string>;
  };
  const versionNames =
    data.versions && typeof data.versions === 'object' ? Object.keys(data.versions) : [];
  const distTags =
    data['dist-tags'] && typeof data['dist-tags'] === 'object' ? { ...data['dist-tags'] } : {};

  return {
    versions: [...versionNames].sort(compareRegistryVersionsDescending),
    distTags,
  };
}

function httpGetText(url: string, redirectsLeft = 5): Promise<string> {
  if (httpGetOverride) {
    return httpGetOverride(url);
  }

  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`JS Runner: invalid registry URL "${url}".`));
      return;
    }

    const client = parsed.protocol === 'http:' ? http : https;
    const request = client.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'js-runner-kit',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location && redirectsLeft > 0) {
          const nextUrl = new URL(response.headers.location, url).toString();
          response.resume();
          resolve(httpGetText(nextUrl, redirectsLeft - 1));
          return;
        }

        if (status !== 200) {
          response.resume();
          reject(new Error(`JS Runner: registry request failed (${status}) for ${url}.`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        response.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        response.on('error', reject);
      },
    );

    request.on('error', reject);
    request.setTimeout(20_000, () => {
      request.destroy();
      reject(new Error('JS Runner: registry request timed out.'));
    });
  });
}

export async function fetchRegistryPackageVersions(
  registryUrl: string,
  packageName: string,
): Promise<RegistryPackageVersions> {
  const url = buildRegistryPackageMetadataUrl(registryUrl, packageName);
  const body = await httpGetText(url);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`JS Runner: registry returned invalid JSON for ${packageName}.`);
  }
  return parseRegistryPackageMetadata(payload);
}
