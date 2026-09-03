export interface RegistryPreset {
  id: string;
  label: string;
  url: string;
  category: 'official' | 'mirror';
}

export const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/';

export const REGISTRY_PRESETS: RegistryPreset[] = [
  {
    id: 'npm',
    label: 'npm Official',
    url: 'https://registry.npmjs.org/',
    category: 'official',
  },
  {
    id: 'yarn',
    label: 'Yarn Official',
    url: 'https://registry.yarnpkg.com/',
    category: 'official',
  },
  {
    id: 'npmmirror',
    label: 'npmmirror (Taobao)',
    url: 'https://registry.npmmirror.com',
    category: 'mirror',
  },
  {
    id: 'tencent',
    label: 'Tencent Cloud',
    url: 'https://mirrors.cloud.tencent.com/npm/',
    category: 'mirror',
  },
  {
    id: 'huawei',
    label: 'Huawei Cloud',
    url: 'https://mirrors.huaweicloud.com/repository/npm/',
    category: 'mirror',
  },
  {
    id: 'cnpm',
    label: 'CNPM',
    url: 'https://r.cnpmjs.org/',
    category: 'mirror',
  },
  {
    id: 'aliyun',
    label: 'Aliyun NPM',
    url: 'https://npm.aliyun.com',
    category: 'mirror',
  },
  {
    id: 'ustc',
    label: 'USTC',
    url: 'https://mirrors.ustc.edu.cn/npm/',
    category: 'mirror',
  },
  {
    id: 'netease',
    label: 'NetEase',
    url: 'https://mirrors.163.com/npm/',
    category: 'mirror',
  },
  {
    id: 'gitee',
    label: 'Gitee',
    url: 'https://mirrors.gitee.com',
    category: 'mirror',
  },
];

export function getRegistryPresetById(id: string): RegistryPreset | undefined {
  return REGISTRY_PRESETS.find((preset) => preset.id === id);
}

export function normalizeRegistryUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

export function findRegistryPresetByUrl(url: string): RegistryPreset | undefined {
  const normalized = normalizeRegistryUrl(url);
  return REGISTRY_PRESETS.find(
    (preset) => normalizeRegistryUrl(preset.url) === normalized,
  );
}

export function getRegistryDisplayLabel(registrySetting: string, registryUrl: string): string {
  if (registrySetting === 'auto') {
    const preset = findRegistryPresetByUrl(registryUrl);
    return preset ? `auto (${preset.label})` : `auto (${registryUrl})`;
  }

  const preset = getRegistryPresetById(registrySetting);
  if (preset) {
    return preset.label;
  }

  return registrySetting;
}
