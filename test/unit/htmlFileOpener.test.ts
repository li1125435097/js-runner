import { expect } from 'chai';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import { createVscodeMock } from '../helpers/vscodeMock';

describe('htmlFileOpener', () => {
  afterEach(() => {
    sinon.restore();
  });

  function loadHtmlFileOpener(vscodeMock: ReturnType<typeof createVscodeMock>) {
    return proxyquire.noCallThru()('../../htmlFileOpener', {
      vscode: vscodeMock,
    });
  }

  it('extractUrlFromTerminal returns the URL at the click position', () => {
    const { extractUrlFromTerminal } = loadHtmlFileOpener(createVscodeMock());
    const line = 'Open file:///C:/workspace/Hello.html in browser';

    expect(extractUrlFromTerminal(line, 5)).to.equal('file:///C:/workspace/Hello.html');
    expect(extractUrlFromTerminal(line, 0)).to.be.undefined;
  });

  it('openHtmlFile uses openExternal with a file URL', async () => {
    const vscodeMock = createVscodeMock();
    const { openHtmlFile } = loadHtmlFileOpener(vscodeMock);
    const filePath = 'C:\\workspace\\Hello.html';

    await openHtmlFile(filePath);

    expect(vscodeMock.env.openExternal.calledOnce).to.be.true;
    const uri = vscodeMock.env.openExternal.firstCall.args[0];
    expect(uri.toString()).to.match(/^file:\/\//);
  });

  it('throws when openExternal returns false', async () => {
    const vscodeMock = createVscodeMock();
    vscodeMock.env.openExternal.resolves(false);
    const { openHtmlFile } = loadHtmlFileOpener(vscodeMock);

    try {
      await openHtmlFile('C:\\workspace\\Hello.html');
      expect.fail('expected openHtmlFile to throw');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.equal('Failed to open URL in the system default browser.');
    }
  });
});
