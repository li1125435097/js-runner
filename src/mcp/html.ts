export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function summarizeJson(value: unknown, max = 160): string {
  try {
    const text = JSON.stringify(value) ?? '';
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max)}…`;
  } catch {
    return String(value);
  }
}
