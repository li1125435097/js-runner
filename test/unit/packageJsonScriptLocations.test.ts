import { expect } from 'chai';
import * as proxyquire from 'proxyquire';

type LocationsModule = {
  locateNpmScripts: (text: string) => Array<{
    name: string;
    command: string;
    keyStartOffset: number;
    keyEndOffset: number;
  }>;
};

function loadLocations(): LocationsModule {
  return proxyquire.noCallThru()('../../providers/packageJsonScriptLocations', {}) as LocationsModule;
}

function sliceKey(
  text: string,
  loc: { keyStartOffset: number; keyEndOffset: number },
): string {
  return text.slice(loc.keyStartOffset, loc.keyEndOffset);
}

describe('locateNpmScripts', () => {
  it('locates script keys in a formatted package.json', () => {
    const { locateNpmScripts } = loadLocations();
    const text = `{
  "name": "demo",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173 --open /very/long/path",
    "lint": "eslint src --max-warnings=0 --fix"
  }
}`;

    const located = locateNpmScripts(text);
    expect(located.map((item) => item.name)).to.deep.equal(['dev', 'lint']);
    expect(located[0].command).to.include('vite --host');
    expect(sliceKey(text, located[0])).to.equal('"dev"');
    expect(sliceKey(text, located[1])).to.equal('"lint"');
    expect(text.slice(located[0].keyEndOffset)).to.match(/^\s*:/);
  });

  it('locates script keys in minified json', () => {
    const { locateNpmScripts } = loadLocations();
    const text = '{"scripts":{"dev":"vite","lint":"eslint ."}}';

    const located = locateNpmScripts(text);
    expect(located.map((item) => item.name)).to.deep.equal(['dev', 'lint']);
    expect(sliceKey(text, located[0])).to.equal('"dev"');
    expect(sliceKey(text, located[1])).to.equal('"lint"');
  });

  it('keeps key offsets before a long command string', () => {
    const { locateNpmScripts } = loadLocations();
    const command = `node ${'a'.repeat(200)}.js --flag`;
    const text = `{\n  "scripts": {\n    "start": "${command}"\n  }\n}`;

    const [start] = locateNpmScripts(text);
    expect(start.name).to.equal('start');
    expect(start.command).to.equal(command);
    expect(sliceKey(text, start)).to.equal('"start"');
    expect(text.indexOf(command)).to.be.greaterThan(start.keyEndOffset);
  });

  it('ignores nested scripts objects outside the top-level key', () => {
    const { locateNpmScripts } = loadLocations();
    const text = `{
  "foo": { "scripts": { "nested": "echo nested" } },
  "scripts": {
    "build": "tsc"
  }
}`;

    const located = locateNpmScripts(text);
    expect(located.map((item) => item.name)).to.deep.equal(['build']);
    expect(sliceKey(text, located[0])).to.equal('"build"');
  });

  it('locates escaped script names', () => {
    const { locateNpmScripts } = loadLocations();
    const text = '{"scripts":{"pre\\"build":"tsc"}}';

    const located = locateNpmScripts(text);
    expect(located).to.have.length(1);
    expect(located[0].name).to.equal('pre"build');
    expect(sliceKey(text, located[0])).to.equal('"pre\\"build"');
  });

  it('returns empty for invalid json, missing scripts, or non-object scripts', () => {
    const { locateNpmScripts } = loadLocations();

    expect(locateNpmScripts('{')).to.deep.equal([]);
    expect(locateNpmScripts('{"name":"demo"}')).to.deep.equal([]);
    expect(locateNpmScripts('{"scripts":[]}')).to.deep.equal([]);
    expect(locateNpmScripts('{"scripts":{"ok":1}}')).to.deep.equal([]);
  });
});
