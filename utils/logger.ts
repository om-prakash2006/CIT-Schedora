const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'secret',
  'session_secret',
  'sessionsecret',
  'gemini_api_key',
  'geminiapikey',
  'database_url',
  'databaseurl',
  'authorization',
  'cookie',
  'set-cookie',
  'token',
]);

export function redactSensitiveData(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item));
  }
  if (typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = redactSensitiveData(value);
      }
    }
    return sanitized;
  }
  return input;
}

export interface LogEntry {
  readonly timestamp: string;
  readonly level: 'info' | 'warn' | 'error';
  readonly message: string;
  readonly requestId?: string;
  readonly meta?: Record<string, unknown>;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>, requestId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      ...(requestId ? { requestId } : {}),
      ...(meta ? { meta: redactSensitiveData(meta) as Record<string, unknown> } : {}),
    };
    if (process.env.APP_ENV !== 'test') {
      console.log(JSON.stringify(entry));
    }
  },

  warn(message: string, meta?: Record<string, unknown>, requestId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      ...(requestId ? { requestId } : {}),
      ...(meta ? { meta: redactSensitiveData(meta) as Record<string, unknown> } : {}),
    };
    if (process.env.APP_ENV !== 'test') {
      console.log(JSON.stringify(entry));
    }
  },

  error(message: string, meta?: Record<string, unknown>, requestId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      ...(requestId ? { requestId } : {}),
      ...(meta ? { meta: redactSensitiveData(meta) as Record<string, unknown> } : {}),
    };
    if (process.env.APP_ENV !== 'test') {
      console.error(JSON.stringify(entry));
    }
  },
};
