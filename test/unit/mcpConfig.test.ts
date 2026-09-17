import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import { createVscodeMock } from '../helpers/vscodeMock';

function loadConfig(configuration: Record<string, unknown> = {}) {
  const vscodeMock = createVscodeMock({ configuration });
  return proxyquire.noCallThru()('../../mcp/mcpConfig', {
    vscode: vscodeMock,
  }) as {
    generateMcpApiKey: () => string;
    getMcpServerSettings: () => {
      enabled: boolean;
      port: number;
      apiKey: string;
      maxLogEntries: number;
    };
    clampMcpPort: (port: number) => number;
    clampMaxLogEntries: (value: number) => number;
    buildMcpClientConfigJson: (port: number, apiKey: string) => string;
  };
}

describe('mcpConfig', () => {
  it('generates a 32-character hex API key', () => {
    const { generateMcpApiKey } = loadConfig();
    const key = generateMcpApiKey();
    expect(key).to.match(/^[0-9a-f]{32}$/);
    expect(generateMcpApiKey()).to.not.equal(key);
  });

  it('returns defaults when settings are unset', () => {
    const { getMcpServerSettings } = loadConfig();
    expect(getMcpServerSettings()).to.deep.equal({
      enabled: true,
      port: 38888,
      apiKey: '',
      maxLogEntries: 100000,
      autoRegisterClient: true,
    });
  });

  it('clamps port and max log entries', () => {
    const { clampMcpPort, clampMaxLogEntries } = loadConfig();
    expect(clampMcpPort(0)).to.equal(1);
    expect(clampMcpPort(70000)).to.equal(65535);
    expect(clampMcpPort(Number.NaN)).to.equal(38888);
    expect(clampMaxLogEntries(0)).to.equal(1);
    expect(clampMaxLogEntries(12.9)).to.equal(12);
  });

  it('reads stored settings and trims the API key', () => {
    const { getMcpServerSettings } = loadConfig({
      'jsRunner.mcpServer.enabled': false,
      'jsRunner.mcpServer.port': 40000,
      'jsRunner.mcpServer.apiKey': '  secret  ',
      'jsRunner.mcpServer.maxLogEntries': 50,
    });
    expect(getMcpServerSettings()).to.deep.equal({
      enabled: false,
      port: 40000,
      apiKey: 'secret',
      maxLogEntries: 50,
      autoRegisterClient: true,
    });
  });

  it('builds MCP client JSON with the current port and api-key', () => {
    const { buildMcpClientConfigJson } = loadConfig();
    expect(buildMcpClientConfigJson(38888, 'f2f54b6f8b9d4aacac53f58218663563')).to.equal(
      JSON.stringify(
        {
          js_runner_kit: {
            url: 'http://127.0.0.1:38888/mcp',
            headers: {
              'api-key': 'f2f54b6f8b9d4aacac53f58218663563',
            },
          },
        },
        null,
        4,
      ),
    );
  });
});
