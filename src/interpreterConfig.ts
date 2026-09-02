import * as vscode from 'vscode';
import { LanguageInterpreter } from './types';

export const DEFAULT_INTERPRETERS: LanguageInterpreter[] = [
  { languageId: 'javascript', label: 'JavaScript', path: 'node' },
  { languageId: 'javascriptreact', label: 'JavaScript React', path: 'node' },
  { languageId: 'typescript', label: 'TypeScript', path: 'node' },
  { languageId: 'python', label: 'Python', path: 'python' },
];

export function getInterpreters(): LanguageInterpreter[] {
  return vscode.workspace
    .getConfiguration('jsRunner')
    .get<LanguageInterpreter[]>('interpreters', DEFAULT_INTERPRETERS);
}

export function getInterpreterForLanguage(languageId: string): LanguageInterpreter | undefined {
  return getInterpreters().find((item) => item.languageId === languageId);
}

export async function saveInterpreters(interpreters: LanguageInterpreter[]): Promise<void> {
  await vscode.workspace
    .getConfiguration('jsRunner')
    .update('interpreters', interpreters, vscode.ConfigurationTarget.Global);
}
