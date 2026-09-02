import { expect } from 'chai';
import * as proxyquire from 'proxyquire';

type TerminalCommandModule = {
  buildRunCommand: (interpreterPath: string, filePath: string) => string;
  quoteShellArg: (value: string) => string;
  splitInterpreterCommand: (interpreterPath: string) => { executable: string; args: string };
};

function loadTerminalCommandModule(): TerminalCommandModule {
  return proxyquire.noCallThru()('../../terminalCommand', {}) as TerminalCommandModule;
}

describe('terminalCommand', () => {
  it('quotes Windows interpreter paths with spaces', () => {
    const { buildRunCommand } = loadTerminalCommandModule();
    const command = buildRunCommand(
      'C:\\Program Files\\Common Files\\Oracle\\Java\\javapath\\java.exe',
      'c:\\Users\\bit2020\\Hello.java',
    );

    expect(command).to.equal(
      '"C:/Program Files/Common Files/Oracle/Java/javapath/java.exe" "c:/Users/bit2020/Hello.java"',
    );
  });

  it('quotes Windows bash paths and script paths', () => {
    const { buildRunCommand } = loadTerminalCommandModule();
    const command = buildRunCommand(
      'C:\\Windows\\System32\\bash.exe',
      'c:\\Users\\bit2020\\Hello.sh',
    );

    expect(command).to.equal(
      '"C:/Windows/System32/bash.exe" "c:/Users/bit2020/Hello.sh"',
    );
  });

  it('keeps interpreter arguments outside quoted executable', () => {
    const { buildRunCommand } = loadTerminalCommandModule();
    const command = buildRunCommand(
      'C:\\Program Files\\nodejs\\node.exe --experimental-strip-types',
      'C:\\workspace\\Hello.ts',
    );

    expect(command).to.equal(
      '"C:/Program Files/nodejs/node.exe" --experimental-strip-types "C:/workspace/Hello.ts"',
    );
  });

  it('leaves simple PATH commands unquoted', () => {
    const { buildRunCommand } = loadTerminalCommandModule();
    expect(buildRunCommand('node', '/workspace/hello.js')).to.equal('node /workspace/hello.js');
    expect(buildRunCommand('python', 'script.py')).to.equal('python script.py');
  });

  it('supports pre-quoted executable paths', () => {
    const { splitInterpreterCommand, quoteShellArg } = loadTerminalCommandModule();
    expect(splitInterpreterCommand('"C:\\Program Files\\java.exe" --flag')).to.deep.equal({
      executable: 'C:\\Program Files\\java.exe',
      args: '--flag',
    });
    expect(quoteShellArg('C:\\Program Files\\java.exe')).to.equal('"C:/Program Files/java.exe"');
  });

  it('splits unquoted Windows executables before trailing args', () => {
    const { splitInterpreterCommand } = loadTerminalCommandModule();
    expect(
      splitInterpreterCommand('C:\\Program Files\\nodejs\\node.exe --experimental-strip-types'),
    ).to.deep.equal({
      executable: 'C:\\Program Files\\nodejs\\node.exe',
      args: '--experimental-strip-types',
    });
  });
});
