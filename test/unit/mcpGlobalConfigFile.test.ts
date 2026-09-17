import { expect } from 'chai';
import * as proxyquire from 'proxyquire';

function loadModule() {
  return proxyquire.noCallThru()('../../mcp/mcpGlobalConfigFile', {
    './mcpConfig': {
      clampMcpPort: (port: number) => port,
    },
    '../shortcuts/userKeybindingsFile': {
      resolveUserKeybindingsPath: (
        appName: string,
        env: NodeJS.ProcessEnv = process.env,
        platform: NodeJS.Platform = process.platform,
      ) => {
        if (platform === 'win32') {
          const appData = env.APPDATA || 'C:\\Users\\me\\AppData\\Roaming';
          const folder = appName.toLowerCase().includes('insiders') ? 'Code - Insiders' : 'Code';
          return `${appData}\\${folder}\\User\\keybindings.json`;
        }
        return '/home/me/.config/Code/User/keybindings.json';
      },
      stripJsonc: (text: string) => text,
    },
  }) as {
    MCP_CLIENT_SERVER_NAME: string;
    buildRemoteMcpServerEntry: (appName: string, port: number, apiKey: string) => Record<string, unknown>;
    mergeJsRunnerMcpServerEntry: (
      appName: string,
      existingText: string | undefined,
      port: number,
      apiKey: string,
    ) => string;
    mcpServersPropertyForApp: (appName: string) => 'mcpServers' | 'servers';
    resolveGlobalMcpJsonPath: (
      appName: string,
      env?: NodeJS.ProcessEnv,
      platform?: NodeJS.Platform,
    ) => string;
  };
}

describe('mcpGlobalConfigFile', () => {
  it('resolves Cursor and VS Code global mcp.json paths', () => {
    const mod = loadModule();
    expect(
      mod.resolveGlobalMcpJsonPath('Cursor', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'win32'),
    ).to.match(/[\\/]\.cursor[\\/]mcp\.json$/);
    expect(
      mod.resolveGlobalMcpJsonPath('Visual Studio Code', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'win32'),
    ).to.equal('C:\\Users\\me\\AppData\\Roaming\\Code\\User\\mcp.json');
  });

  it('uses mcpServers for Cursor and servers for VS Code', () => {
    const mod = loadModule();
    expect(mod.mcpServersPropertyForApp('Cursor')).to.equal('mcpServers');
    expect(mod.mcpServersPropertyForApp('Visual Studio Code')).to.equal('servers');
  });

  it('builds remote entries with optional api-key headers', () => {
    const mod = loadModule();
    expect(mod.buildRemoteMcpServerEntry('Cursor', 38888, '')).to.deep.equal({
      url: 'http://127.0.0.1:38888/mcp',
    });
    expect(mod.buildRemoteMcpServerEntry('Visual Studio Code', 40000, 'abc')).to.deep.equal({
      type: 'http',
      url: 'http://127.0.0.1:40000/mcp',
      headers: { 'api-key': 'abc' },
    });
  });

  it('merges js_runner_kit into existing Cursor mcp.json', () => {
    const mod = loadModule();
    const merged = mod.mergeJsRunnerMcpServerEntry(
      'Cursor',
      JSON.stringify(
        {
          mcpServers: {
            other: { url: 'http://127.0.0.1:1/mcp' },
          },
        },
        null,
        2,
      ),
      38888,
      'secret',
    );
    const parsed = JSON.parse(merged) as {
      mcpServers: Record<string, { url: string; headers?: { 'api-key': string } }>;
    };
    expect(parsed.mcpServers.other.url).to.equal('http://127.0.0.1:1/mcp');
    expect(parsed.mcpServers[mod.MCP_CLIENT_SERVER_NAME]).to.deep.equal({
      url: 'http://127.0.0.1:38888/mcp',
      headers: { 'api-key': 'secret' },
    });
  });
});
