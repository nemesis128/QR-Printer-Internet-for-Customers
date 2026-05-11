const SENSITIVE_KEYS = ['password', 'passwd', 'pwd', 'key', 'token', 'secret', 'authorization'];

const PATTERNS: RegExp[] = SENSITIVE_KEYS.flatMap((k) => [
  new RegExp(`("${k}"\\s*:\\s*")[^"]*"`, 'gi'),
  new RegExp(`(${k}=)[^&\\s]+`, 'gi'),
]);

export function sanitizeForLog(input: string): string {
  let out = input;
  for (const re of PATTERNS) {
    out = out.replace(re, (match, p1: string) => {
      const p2 = match.endsWith('"') ? '"' : '';
      return `${p1}***REDACTED***${p2}`;
    });
  }
  return out;
}
