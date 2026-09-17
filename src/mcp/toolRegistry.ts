/**
 * 将扩展 commands 映射为 MCP tools（可序列化 JSON Schema）。
 */

export interface McpJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface McpToolDefinition {
  name: string;
  commandId?: string;
  description: string;
  inputSchema: McpJsonSchema;
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): McpJsonSchema {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const stringProp = (description: string) => ({ type: 'string', description });
const booleanProp = (description: string) => ({ type: 'boolean', description });

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'jsRunner_runCurrentFile',
    commandId: 'jsRunner.runCurrentFile',
    description: 'Run a source file with its configured interpreter, replacing existing terminals for that file.',
    inputSchema: objectSchema(
      {
        filePath: stringProp('Absolute path of the file to run'),
        languageId: stringProp('VS Code language ID. Inferred from the file extension when omitted'),
      },
      ['filePath'],
    ),
  },
  {
    name: 'jsRunner_runCurrentFileNewTerminal',
    commandId: 'jsRunner.runCurrentFileNewTerminal',
    description: 'Run a source file in a new terminal without stopping other runs of the same file.',
    inputSchema: objectSchema(
      {
        filePath: stringProp('Absolute path of the file to run'),
        languageId: stringProp('VS Code language ID. Inferred from the file extension when omitted'),
      },
      ['filePath'],
    ),
  },
  {
    name: 'jsRunner_stopAll',
    commandId: 'jsRunner.stopAll',
    description: 'Stop all running scripts tracked by JS Runner.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'jsRunner_stopTerminal',
    commandId: 'jsRunner.stopTerminal',
    description: 'Stop one running script by terminal id.',
    inputSchema: objectSchema(
      { terminalId: stringProp('Running script / terminal id') },
      ['terminalId'],
    ),
  },
  {
    name: 'jsRunner_refreshScripts',
    commandId: 'jsRunner.refreshScripts',
    description: 'Rescan workspace package.json files and refresh the NPM Scripts view.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'jsRunner_filterNpmScripts',
    commandId: 'jsRunner.filterNpmScripts',
    description: 'Filter NPM Scripts by package path query. Empty query clears the filter.',
    inputSchema: objectSchema(
      { query: stringProp('Package path search string') },
      ['query'],
    ),
  },
  {
    name: 'jsRunner_clearNpmScriptsFilter',
    commandId: 'jsRunner.clearNpmScriptsFilter',
    description: 'Clear the NPM Scripts package path filter.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'jsRunner_pinNpmScript',
    commandId: 'jsRunner.pinNpmScript',
    description: 'Pin an npm script to the top of its package group.',
    inputSchema: objectSchema(
      {
        name: stringProp('Script name'),
        packageJsonPath: stringProp('Absolute path to package.json'),
      },
      ['name', 'packageJsonPath'],
    ),
  },
  {
    name: 'jsRunner_unpinNpmScript',
    commandId: 'jsRunner.unpinNpmScript',
    description: 'Unpin an npm script.',
    inputSchema: objectSchema(
      {
        name: stringProp('Script name'),
        packageJsonPath: stringProp('Absolute path to package.json'),
      },
      ['name', 'packageJsonPath'],
    ),
  },
  {
    name: 'jsRunner_pinNpmPackage',
    commandId: 'jsRunner.pinNpmPackage',
    description: 'Pin a package group to the top of the NPM Scripts view.',
    inputSchema: objectSchema(
      { packageJsonPath: stringProp('Absolute path to package.json') },
      ['packageJsonPath'],
    ),
  },
  {
    name: 'jsRunner_unpinNpmPackage',
    commandId: 'jsRunner.unpinNpmPackage',
    description: 'Unpin a package group.',
    inputSchema: objectSchema(
      { packageJsonPath: stringProp('Absolute path to package.json') },
      ['packageJsonPath'],
    ),
  },
  {
    name: 'jsRunner_runNpmScript',
    commandId: 'jsRunner.runNpmScript',
    description: 'Run an npm script from a package.json in a new terminal.',
    inputSchema: objectSchema(
      {
        name: stringProp('Script name'),
        packageJsonPath: stringProp('Absolute path to package.json'),
      },
      ['name', 'packageJsonPath'],
    ),
  },
  {
    name: 'jsRunner_debugNpmScript',
    commandId: 'jsRunner.debugNpmScript',
    description: 'Debug an npm script with the VS Code JavaScript Debugger.',
    inputSchema: objectSchema(
      {
        name: stringProp('Script name'),
        packageJsonPath: stringProp('Absolute path to package.json'),
        command: stringProp('Script command from package.json. Looked up when omitted'),
      },
      ['name', 'packageJsonPath'],
    ),
  },
  {
    name: 'jsRunner_setNpmScriptShortcut',
    commandId: 'jsRunner.setNpmScriptShortcut',
    description: 'Bind a keyboard shortcut keyId to an npm script without opening the picker UI.',
    inputSchema: objectSchema(
      {
        name: stringProp('Script name'),
        packageJsonPath: stringProp('Absolute path to package.json'),
        keyId: stringProp('Shortcut key id such as f5 or ctrl+alt+f1'),
      },
      ['name', 'packageJsonPath', 'keyId'],
    ),
  },
  {
    name: 'jsRunner_runNpmScriptByShortcut',
    commandId: 'jsRunner.runNpmScriptByShortcut',
    description: 'Run the npm script bound to a shortcut keyId.',
    inputSchema: objectSchema(
      { keyId: stringProp('Shortcut key id such as f5') },
      ['keyId'],
    ),
  },
  {
    name: 'jsRunner_focusRunningTerminal',
    commandId: 'jsRunner.focusRunningTerminal',
    description: 'Focus the terminal for a running script id.',
    inputSchema: objectSchema(
      { terminalId: stringProp('Running script / terminal id') },
      ['terminalId'],
    ),
  },
  {
    name: 'jsRunner_viewInstalledPackages',
    commandId: 'jsRunner.viewInstalledPackages',
    description: 'Open the installed packages webview for a package.json.',
    inputSchema: objectSchema(
      { packageJsonPath: stringProp('Absolute path to package.json') },
      ['packageJsonPath'],
    ),
  },
  {
    name: 'jsRunner_selectPackageManager',
    commandId: 'jsRunner.selectPackageManager',
    description: 'Set the package manager for a package without opening Quick Pick.',
    inputSchema: objectSchema(
      {
        packageJsonPath: stringProp('Absolute path to package.json'),
        manager: stringProp('auto, npm, yarn, pnpm, bun, or a custom CLI name'),
      },
      ['packageJsonPath', 'manager'],
    ),
  },
  {
    name: 'jsRunner_selectRegistry',
    commandId: 'jsRunner.selectRegistry',
    description: 'Set the npm registry for a package without opening Quick Pick.',
    inputSchema: objectSchema(
      {
        packageJsonPath: stringProp('Absolute path to package.json'),
        registry: stringProp('auto, a preset id such as npmmirror, or an http(s) URL'),
      },
      ['packageJsonPath', 'registry'],
    ),
  },
  {
    name: 'jsRunner_installDependencies',
    commandId: 'jsRunner.installDependencies',
    description: 'Install dependencies for a package in a terminal. Does not prompt. Set wipe=true to delete node_modules first.',
    inputSchema: objectSchema(
      {
        packageJsonPath: stringProp('Absolute path to package.json'),
        wipe: booleanProp('Delete existing node_modules before install'),
      },
      ['packageJsonPath'],
    ),
  },
  {
    name: 'jsRunner_addInterpreter',
    commandId: 'jsRunner.addInterpreter',
    description: 'Add a language interpreter mapping.',
    inputSchema: objectSchema(
      {
        languageId: stringProp('VS Code language ID'),
        path: stringProp('Interpreter executable path or command'),
        label: stringProp('Optional display label'),
      },
      ['languageId', 'path'],
    ),
  },
  {
    name: 'jsRunner_editInterpreter',
    commandId: 'jsRunner.editInterpreter',
    description: 'Edit an existing language interpreter by languageId.',
    inputSchema: objectSchema(
      {
        languageId: stringProp('VS Code language ID to update'),
        path: stringProp('Interpreter executable path or command'),
        label: stringProp('Display label'),
      },
      ['languageId'],
    ),
  },
  {
    name: 'jsRunner_removeInterpreter',
    commandId: 'jsRunner.removeInterpreter',
    description: 'Remove a language interpreter by languageId without a confirmation dialog.',
    inputSchema: objectSchema(
      { languageId: stringProp('VS Code language ID to remove') },
      ['languageId'],
    ),
  },
  {
    name: 'jsRunner_listRunningScripts',
    description: 'List scripts currently tracked in Running Scripts.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'jsRunner_listNpmScripts',
    description: 'List discovered workspace npm scripts grouped by package.json.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'jsRunner_listInterpret',
    description: 'List configured language interpreters (including defaults and discovered local runtimes).',
    inputSchema: objectSchema({}),
  },
  {
    name: 'jsRunner_getPinnedForeground',
    description: 'Get the effective pinned foreground color used for pinned npm scripts and packages.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'jsRunner_setPinnedForeground',
    description: 'Set jsRunner.pinnedForeground to a hex color and sync workbench color customizations.',
    inputSchema: objectSchema(
      { color: stringProp('Hex color such as #46ee37') },
      ['color'],
    ),
  },
  {
    name: 'jsRunner_listPinnedScripts',
    description: 'List npm scripts and packages pinned in the NPM Scripts view for this workspace.',
    inputSchema: objectSchema({}),
  },
];

export const MCP_COMMAND_IDS = MCP_TOOLS.map((tool) => tool.commandId).filter(
  (id): id is string => Boolean(id),
);

export function getMcpTool(name: string): McpToolDefinition | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

export function listMcpToolsForProtocol(): Array<{
  name: string;
  description: string;
  inputSchema: McpJsonSchema;
}> {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}
