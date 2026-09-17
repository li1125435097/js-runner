import { expect } from 'chai';
import * as proxyquire from 'proxyquire';

const EXPECTED_COMMAND_IDS = [
  'jsRunner.runCurrentFile',
  'jsRunner.runCurrentFileNewTerminal',
  'jsRunner.stopAll',
  'jsRunner.stopTerminal',
  'jsRunner.refreshScripts',
  'jsRunner.filterNpmScripts',
  'jsRunner.clearNpmScriptsFilter',
  'jsRunner.pinNpmScript',
  'jsRunner.unpinNpmScript',
  'jsRunner.pinNpmPackage',
  'jsRunner.unpinNpmPackage',
  'jsRunner.runNpmScript',
  'jsRunner.debugNpmScript',
  'jsRunner.setNpmScriptShortcut',
  'jsRunner.runNpmScriptByShortcut',
  'jsRunner.focusRunningTerminal',
  'jsRunner.viewInstalledPackages',
  'jsRunner.selectPackageManager',
  'jsRunner.selectRegistry',
  'jsRunner.installDependencies',
  'jsRunner.addInterpreter',
  'jsRunner.editInterpreter',
  'jsRunner.removeInterpreter',
];

function loadRegistry() {
  return proxyquire.noCallThru()('../../mcp/toolRegistry', {}) as {
    MCP_COMMAND_IDS: string[];
    MCP_TOOLS: Array<{ name: string; inputSchema: { type: string } }>;
    getMcpTool: (name: string) => { inputSchema: { type: string } } | undefined;
  };
}

describe('toolRegistry', () => {
  it('covers every contributed JS Runner command', () => {
    const { MCP_COMMAND_IDS } = loadRegistry();
    expect(MCP_COMMAND_IDS.slice().sort()).to.deep.equal(EXPECTED_COMMAND_IDS.slice().sort());
  });

  it('exposes discovery tools and valid MCP tool names', () => {
    const { MCP_TOOLS, getMcpTool } = loadRegistry();
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names).to.include('jsRunner_listRunningScripts');
    expect(names).to.include('jsRunner_listNpmScripts');
    expect(names).to.include('jsRunner_listInterpret');
    expect(names).to.include('jsRunner_getPinnedForeground');
    expect(names).to.include('jsRunner_setPinnedForeground');
    expect(names).to.include('jsRunner_listPinnedScripts');
    for (const name of names) {
      expect(name).to.match(/^[A-Za-z0-9_-]+$/);
      expect(getMcpTool(name)?.inputSchema.type).to.equal('object');
    }
  });
});
