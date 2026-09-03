import * as vscode from 'vscode';
import { appendAvailableLocalInterpreters } from './interpreterDiscovery';
import { LanguageInterpreter } from '../common/types';

export const DEFAULT_INTERPRETERS: LanguageInterpreter[] = [
  { languageId: 'shellscript', label: 'Bash', path: 'bash' },
  { languageId: 'java', label: 'Java', path: 'java' },
  { languageId: 'javascript', label: 'JavaScript', path: 'node' },
  { languageId: 'javascriptreact', label: 'JavaScript React', path: 'node' },
  { languageId: 'python', label: 'Python', path: 'python' },
  { languageId: 'typescript', label: 'TypeScript', path: 'node --experimental-strip-types' },
  { languageId: 'html', label: 'HTML', path: 'default browser' },
];

function hasExplicitInterpreterConfig(): boolean {
  const inspected = vscode.workspace.getConfiguration('jsRunner').inspect<LanguageInterpreter[]>('interpreters');
  return (
    inspected?.globalValue !== undefined ||
    inspected?.workspaceValue !== undefined ||
    inspected?.workspaceFolderValue !== undefined
  );
}

export function getInterpreters(): LanguageInterpreter[] {
  const config = vscode.workspace.getConfiguration('jsRunner');
  const configured = hasExplicitInterpreterConfig()
    ? config.get<LanguageInterpreter[]>('interpreters', [])
    : [];

  return appendAvailableLocalInterpreters(configured, DEFAULT_INTERPRETERS);
}

export function getInterpreterForLanguage(languageId: string): LanguageInterpreter | undefined {
  return getInterpreters().find((item) => item.languageId === languageId);
}

export async function saveInterpreters(interpreters: LanguageInterpreter[]): Promise<void> {
  await vscode.workspace
    .getConfiguration('jsRunner')
    .update('interpreters', interpreters, vscode.ConfigurationTarget.Global);
}
