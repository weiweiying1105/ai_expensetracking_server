// Utility helpers for environment variables

// Remove leading/trailing quotes and whitespace from env values
export function sanitizeEnv(value?: string | undefined): string | undefined {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  // Strip matching leading/trailing single or double quotes
  return trimmed.replace(/^['"]+|['"]+$/g, '');
}

// Mask a secret for safe logging (keep last N chars)
export function maskSecret(value: string, keep: number = 4): string {
  if (!value) return '""';
  const len = value.length;
  const shown = value.slice(Math.max(0, len - keep));
  return `${'*'.repeat(Math.max(0, len - keep))}${shown}`;
}

// Safe logger to report env status without exposing full secrets
export function logEnvStatus(name: string, raw?: string): void {
  if (typeof raw !== 'string' || raw.length === 0) {
    console.warn(`${name} is missing or empty.`);
    return;
  }
  const masked = maskSecret(raw);
  const hasLeadingQuote = /^['"]/.test(raw);
  const hasTrailingQuote = /['"]$/.test(raw);
  console.info(`${name} length: ${raw.length}, masked: ${masked}, leadingQuote: ${hasLeadingQuote}, trailingQuote: ${hasTrailingQuote}`);
}