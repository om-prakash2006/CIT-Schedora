import React, { createContext, useContext, useEffect, useState } from 'react';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json' with { type: 'json' };
import {
  type AccountStatus,
  type AuthenticatedSessionPrincipal,
  type EffectivePermissions,
  InstitutionalRole,
} from '../../types/domain.types.ts';
import {
  clearStoredAuthTokens,
  getStoredCsrfToken,
  getStoredSessionToken,
  setStoredAuthTokens,
} from '../utils/apiClient.ts';

export type RoleIdentifier =
  | InstitutionalRole
  | 'ADMIN'
  | 'DEPARTMENT_COORDINATOR'
  | 'FACULTY'
  | 'CLUB'
  | 'CLUB_REPRESENTATIVE';

export interface AuthenticatedUser {
  uid?: string;
  id?: string;
  userId?: string;
  email: string;
  displayName?: string;
  role: RoleIdentifier;
  department?: string;
  departmentId?: string | null;
  facultyId?: string | null;
  clubId?: string | null;
  organisationName?: string;
  accountStatus?: AccountStatus;
  authorizationVersion?: number;
  permissions?: EffectivePermissions;
}

export interface LoginResult {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  redirectTo?: string;
}

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  authenticated: boolean;
  isLoading: boolean;
  loading: boolean;
  authConfigured: boolean;
  csrfToken: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

let browserFirebaseAuthInstance: Auth | null = null;
let browserEmulatorConnected = false;

function getBrowserFirebaseAuth(): Auth | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (browserFirebaseAuthInstance) {
    return browserFirebaseAuthInstance;
  }

  const existing = getApps().find((a) => a.name === 'cit-schedora-browser-auth');
  const app: FirebaseApp =
    existing ??
    initializeApp(
      {
        projectId: firebaseAppletConfig.projectId,
        appId: firebaseAppletConfig.appId,
        apiKey: firebaseAppletConfig.apiKey,
        authDomain: firebaseAppletConfig.authDomain,
      },
      'cit-schedora-browser-auth'
    );

  const auth = getAuth(app);
  void setPersistence(auth, inMemoryPersistence);
  if (!browserEmulatorConnected && window.location?.origin) {
    connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
    browserEmulatorConnected = true;
  }

  browserFirebaseAuthInstance = auth;
  return auth;
}

export function normalizeRole(role: RoleIdentifier): InstitutionalRole {
  switch (role) {
    case InstitutionalRole.ADMIN:
    case 'ADMIN':
      return InstitutionalRole.ADMIN;
    case InstitutionalRole.DEPARTMENT_COORDINATOR:
    case 'DEPARTMENT_COORDINATOR':
      return InstitutionalRole.DEPARTMENT_COORDINATOR;
    case InstitutionalRole.FACULTY:
    case 'FACULTY':
      return InstitutionalRole.FACULTY;
    case InstitutionalRole.CLUB:
    case 'CLUB':
    case 'CLUB_REPRESENTATIVE':
      return InstitutionalRole.CLUB;
    default:
      return InstitutionalRole.ADMIN;
  }
}

export function getRoleDefaultRoute(role: RoleIdentifier): string {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case InstitutionalRole.ADMIN:
      return '/admin/dashboard';
    case InstitutionalRole.DEPARTMENT_COORDINATOR:
      return '/coordinator/department-event-bookings';
    case InstitutionalRole.FACULTY:
      return '/faculty/timetable';
    case InstitutionalRole.CLUB:
      return '/club/submit-venue-request';
    default:
      return '/login';
  }
}

export function isRoutePermittedForRole(pathname: string, role: RoleIdentifier): boolean {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case InstitutionalRole.ADMIN:
      return pathname.startsWith('/admin/');
    case InstitutionalRole.DEPARTMENT_COORDINATOR:
      return pathname.startsWith('/coordinator/');
    case InstitutionalRole.FACULTY:
      return pathname.startsWith('/faculty/');
    case InstitutionalRole.CLUB:
      return pathname.startsWith('/club/');
    default:
      return false;
  }
}

export interface InjectedAuthSessionState {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  loading?: boolean;
}

export interface AuthProviderProps {
  children: React.ReactNode;
  /**
   * Optional initial session strictly for automated router/component verification tests.
   * In normal browser execution, session state is fetched exclusively from GET /api/v1/auth/me.
   */
  initialSession?: AuthenticatedUser | InjectedAuthSessionState | null;
}

function resolveInjectedUser(
  initialSession: AuthProviderProps['initialSession']
): AuthenticatedUser | null {
  if (!initialSession) {
    return null;
  }
  if ('authenticated' in initialSession) {
    return initialSession.authenticated ? initialSession.user : null;
  }
  return initialSession;
}

function readCsrfCookieFromDocument(): string | null {
  if (typeof document === 'undefined' || !document.cookie) {
    return null;
  }
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('cit_schedora_csrf='));
  if (!match) return null;
  return decodeURIComponent(match.slice('cit_schedora_csrf='.length));
}

export function AuthProvider({ children, initialSession }: AuthProviderProps) {
  const hasInjectedSession = initialSession !== undefined;
  const [user, setUser] = useState<AuthenticatedUser | null>(() =>
    resolveInjectedUser(initialSession)
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!hasInjectedSession) return true;
    if (
      initialSession &&
      'loading' in initialSession &&
      typeof initialSession.loading === 'boolean'
    ) {
      return initialSession.loading;
    }
    return false;
  });
  const [authConfigured, setAuthConfigured] = useState<boolean>(true);
  const [csrfToken, setCsrfToken] = useState<string | null>(() =>
    readCsrfCookieFromDocument()
  );

  useEffect(() => {
    if (hasInjectedSession) {
      setUser(resolveInjectedUser(initialSession));
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function checkSession() {
      try {
        const token = getStoredSessionToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          headers['x-session-token'] = token;
        }
        const res = await fetch('/api/v1/auth/session', {
          credentials: 'include',
          headers,
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as {
            authenticated: boolean;
            authConfigured: boolean;
            user: AuthenticatedSessionPrincipal | null;
          };
          setAuthConfigured(Boolean(data.authConfigured));
          if (data.authenticated && data.user) {
            setUser(data.user);
            setCsrfToken(readCsrfCookieFromDocument() ?? getStoredCsrfToken());
          } else {
            setUser(null);
            clearStoredAuthTokens();
          }
        } else if (!cancelled) {
          setUser(null);
          clearStoredAuthTokens();
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [hasInjectedSession, initialSession]);

  async function login(email: string, password: string): Promise<LoginResult> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      let idToken: string | undefined;

      const browserAuth = getBrowserFirebaseAuth();
      if (browserAuth) {
        try {
          const credential = await signInWithEmailAndPassword(
            browserAuth,
            normalizedEmail,
            password
          );
          idToken = await credential.user.getIdToken(true);
          await signOut(browserAuth);
        } catch (firebaseErr: unknown) {
          const code =
            firebaseErr &&
            typeof firebaseErr === 'object' &&
            'code' in firebaseErr &&
            typeof (firebaseErr as { code?: unknown }).code === 'string'
              ? (firebaseErr as { code: string }).code
              : '';

          if (code === 'auth/user-disabled') {
            return {
              ok: false,
              errorCode: 'ACCOUNT_DISABLED',
              errorMessage:
                'This institutional account has been disabled or suspended. Please contact the Institutional Administrator.',
            };
          }
          // If browser client auth encounters an issue, fall through to server sessionLogin with email/password
        }
      }

      const response = await fetch('/api/v1/auth/sessionLogin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(
          idToken ? { idToken } : { email: normalizedEmail, password }
        ),
      });

      const payload = (await response.json()) as {
        user?: AuthenticatedSessionPrincipal;
        sessionToken?: string;
        csrfToken?: string;
        redirectPath?: string;
        error?: { code?: string; message?: string };
      };

      if (!response.ok || !payload.user) {
        const errorCode = payload.error?.code ?? 'AUTH_FAILED';
        const errorMessage =
          payload.error?.message ?? 'Unable to verify institutional credentials.';

        return {
          ok: false,
          errorCode,
          errorMessage,
        };
      }

      setStoredAuthTokens(payload.sessionToken, payload.csrfToken);
      setUser(payload.user);
      setCsrfToken(payload.csrfToken ?? readCsrfCookieFromDocument());
      return {
        ok: true,
        redirectTo: payload.redirectPath ?? getRoleDefaultRoute(payload.user.role),
      };
    } catch {
      return {
        ok: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: 'Unable to reach the CIT Schedora authentication service.',
      };
    }
  }

  async function logout(): Promise<void> {
    try {
      const browserAuth = getBrowserFirebaseAuth();
      if (browserAuth) {
        await signOut(browserAuth).catch(() => undefined);
      }
      const token = csrfToken ?? readCsrfCookieFromDocument() ?? getStoredCsrfToken();
      await fetch('/api/v1/auth/sessionLogout', {
        method: 'POST',
        headers: token ? { 'X-CSRF-Token': token } : undefined,
        credentials: 'include',
      });
    } catch {
      // Proceed with clearing client state even if network request fails
    } finally {
      clearStoredAuthTokens();
      setUser(null);
      setCsrfToken(null);
    }
  }

  async function refreshSession(): Promise<boolean> {
    try {
      const token = csrfToken ?? readCsrfCookieFromDocument() ?? getStoredCsrfToken();
      const res = await fetch('/api/v1/auth/sessionRefresh', {
        method: 'POST',
        headers: token ? { 'X-CSRF-Token': token } : undefined,
        credentials: 'include',
      });
      if (!res.ok) {
        clearStoredAuthTokens();
        setUser(null);
        return false;
      }
      const data = (await res.json()) as {
        authenticated: boolean;
        sessionToken?: string;
        user: AuthenticatedSessionPrincipal;
        csrfToken?: string;
      };
      if (data.sessionToken) {
        setStoredAuthTokens(data.sessionToken, data.csrfToken);
      }
      setUser(data.user);
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      return true;
    } catch {
      return false;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        authenticated: Boolean(user),
        isLoading,
        loading: isLoading,
        authConfigured,
        csrfToken,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

