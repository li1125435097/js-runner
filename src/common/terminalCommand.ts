/** Split interpreter path into executable and trailing arguments. */
export function splitInterpreterCommand(interpreterPath: string): { executable: string; args: string } {
  const trimmed = interpreterPath.trim();

  if (trimmed.startsWith('"')) {
    const endQuote = trimmed.indexOf('"', 1);
    if (endQuote > 0) {
      return {
        executable: trimmed.slice(1, endQuote),
        args: trimmed.slice(endQuote + 1).trim(),
      };
    }
  }

  const windowsExecutableMatch = trimmed.match(
    /^([A-Za-z]:[\\/].*?\.(?:exe|cmd|bat|com))(?:\s+(.*))?$/i,
  );
  if (windowsExecutableMatch) {
    return {
      executable: windowsExecutableMatch[1],
      args: windowsExecutableMatch[2]?.trim() ?? '',
    };
  }

  const match = trimmed.match(/^(\S+)(?:\s+(.*))?$/);
  return {
    executable: match?.[1] ?? trimmed,
    args: match?.[2]?.trim() ?? '',
  };
}

export function needsShellQuoting(value: string): boolean {
  return /[\s"'$`!;&|<>()\\^]/.test(value) || /^[A-Za-z]:[/\\]/.test(value);
}

/** Quote a path/argument for POSIX shells (Git Bash, sh, zsh). */
export function quoteShellArg(value: string): string {
  if (!needsShellQuoting(value)) {
    return value;
  }

  const normalized = value.replace(/\\/g, '/');
  return `"${normalized.replace(/"/g, '\\"')}"`;
}

/** Build a shell command that safely runs a file with the configured interpreter. */
export function buildRunCommand(interpreterPath: string, filePath: string): string {
  const { executable, args } = splitInterpreterCommand(interpreterPath);
  const parts = [quoteShellArg(executable)];

  if (args) {
    parts.push(args);
  }

  parts.push(quoteShellArg(filePath));
  return parts.join(' ');
}
