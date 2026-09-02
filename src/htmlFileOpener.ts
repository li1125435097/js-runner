import { pathToFileURL } from 'url';
import * as vscode from 'vscode';

const URL_PATTERN = /(?:file|https?):\/\/[^\s\]'">]+/gi;

/** Extract a URL from terminal output at the given character index (Ctrl+click position). */
export function extractUrlFromTerminal(line: string, clickPosition: number): string | undefined {
  for (const match of line.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (clickPosition >= start && clickPosition < end) {
      return match[0];
    }
  }

  return undefined;
}

export function filePathToUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}

/** Open a URL in the system default browser (same mechanism as Ctrl+click on terminal links). */
export async function openUrlInDefaultBrowser(url: string): Promise<void> {
  const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
  if (!opened) {
    throw new Error('Failed to open URL in the system default browser.');
  }
}

/** Open a local HTML file in the system default browser. */
export async function openHtmlFile(filePath: string): Promise<void> {
  const url = filePathToUrl(filePath);
  await openUrlInDefaultBrowser(url);
}
