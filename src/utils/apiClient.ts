/**
 * CIT Schedora — Client API Client & Session Transport
 *
 * Ensures seamless authentication in iframe environments (e.g. AI Studio Build previews)
 * by managing session tokens in client storage and ensuring credentials, Bearer tokens,
 * and CSRF tokens are attached to every API request.
 */

const SESSION_TOKEN_KEY = 'cit_schedora_session_token';
const CSRF_TOKEN_KEY = 'cit_schedora_csrf_token';

let inMemorySessionToken: string | null = null;
let inMemoryCsrfToken: string | null = null;
let interceptorInstalled = false;

export function getStoredSessionToken(): string | null {
  if (inMemorySessionToken) {
    return inMemorySessionToken;
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (stored && stored.trim().length > 0) {
        inMemorySessionToken = stored.trim();
        return inMemorySessionToken;
      }
    } catch {
      // Ignore sessionStorage access errors in sandboxed iframes
    }
  }
  return null;
}

export function getStoredCsrfToken(): string | null {
  if (inMemoryCsrfToken) {
    return inMemoryCsrfToken;
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = window.sessionStorage.getItem(CSRF_TOKEN_KEY);
      if (stored && stored.trim().length > 0) {
        inMemoryCsrfToken = stored.trim();
        return inMemoryCsrfToken;
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }
  // Fallback to cookie
  if (typeof document !== 'undefined' && document.cookie) {
    const match = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('cit_schedora_csrf='));
    if (match) {
      return decodeURIComponent(match.slice('cit_schedora_csrf='.length));
    }
  }
  return null;
}

export function setStoredAuthTokens(
  sessionToken: string | null | undefined,
  csrfToken: string | null | undefined
): void {
  inMemorySessionToken = sessionToken?.trim() || null;
  inMemoryCsrfToken = csrfToken?.trim() || null;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      if (inMemorySessionToken) {
        window.sessionStorage.setItem(SESSION_TOKEN_KEY, inMemorySessionToken);
      } else {
        window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }

      if (inMemoryCsrfToken) {
        window.sessionStorage.setItem(CSRF_TOKEN_KEY, inMemoryCsrfToken);
      } else {
        window.sessionStorage.removeItem(CSRF_TOKEN_KEY);
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }
}

export function clearStoredAuthTokens(): void {
  setStoredAuthTokens(null, null);
}

export function prepareApiRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): { input: RequestInfo | URL; init: RequestInit } {
  let urlString = '';
  if (typeof input === 'string') {
    urlString = input;
  } else if (input instanceof URL) {
    urlString = input.toString();
  } else if (input && typeof input === 'object' && 'url' in input) {
    urlString = (input as Request).url;
  }

  const isApiRequest =
    urlString.startsWith('/api/') ||
    urlString.includes('/api/v1/') ||
    urlString.startsWith('api/');

  const opts: RequestInit = { ...(init ?? {}) };

  if (!isApiRequest) {
    return { input, init: opts };
  }

  // Always include credentials unless caller explicitly specified 'omit'
  if (!opts.credentials || opts.credentials === 'same-origin') {
    opts.credentials = 'include';
  }

  const headers = new Headers(opts.headers ?? {});

  const sessionToken = getStoredSessionToken();
  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }
  if (sessionToken && !headers.has('x-session-token')) {
    headers.set('x-session-token', sessionToken);
  }

  const csrfToken = getStoredCsrfToken();
  const method = (opts.method ?? 'GET').toUpperCase();
  if (
    csrfToken &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
    !headers.has('x-csrf-token')
  ) {
    headers.set('x-csrf-token', csrfToken);
  }

  opts.headers = headers;
  return { input, init: opts };
}

/**
 * Installs a global fetch interceptor that automatically attaches
 * `credentials: 'include'`, `Authorization: Bearer <token>`, and CSRF tokens
 * to all internal `/api/*` calls.
 */
export function installFetchInterceptor(): void {
  if (typeof window === 'undefined' || interceptorInstalled) {
    return;
  }
  interceptorInstalled = true;

  const realFetch = window.fetch.bind(window);

  const interceptedFetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const prepared = prepareApiRequest(input, init);
    return realFetch(prepared.input, prepared.init);
  };

  try {
    Object.defineProperty(window, 'fetch', {
      value: interceptedFetch,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    try {
      (window as any).fetch = interceptedFetch;
    } catch {
      // Non-fatal if environment strictly protects window.fetch property
    }
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const prepared = prepareApiRequest(input, init);
  const fetchFn = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;
  return fetchFn(prepared.input, prepared.init);
}
