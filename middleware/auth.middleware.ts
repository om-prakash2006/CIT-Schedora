import type { NextFunction, Request, Response } from 'express';
import {
  type AuthenticatedSessionPrincipal,
  InstitutionalRole,
} from '../types/domain.types.ts';
import type { UserProfileDoc } from '../types/firestore-schema.ts';
import { recordAuditEvent } from '../services/audit.service.ts';
import {
  CSRF_COOKIE_NAME,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
  verifySessionCookieAndLoadProfile,
} from '../services/auth.service.ts';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.ts';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedSessionPrincipal;
      authProfile?: UserProfileDoc;
    }
  }
}

export function extractSessionTokenFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.header('cookie'));
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  const authHeader = req.header('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const xSessionToken = req.header('x-session-token');
  if (xSessionToken && xSessionToken.trim().length > 0) {
    return xSessionToken.trim();
  }
  return null;
}

/**
 * 1. `requireAuthentication`:
 * Verifies the HTTP-only Firebase session cookie on every protected backend request,
 * retrieves the current `users/{uid}` profile from Firestore, and confirms that
 * the account is `active` and `authorizationVersion` has not been revoked.
 */
export async function requireAuthentication(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionToken = extractSessionTokenFromRequest(req);
    const { principal, profile } = await verifySessionCookieAndLoadProfile(sessionToken);
    req.authUser = principal;
    req.authProfile = profile;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 2. `requireRole`:
 * Ensures the authenticated user's backend-verified role is within `allowedRoles`.
 * Never trusts client-provided roles.
 */
export function requireRole(...allowedRoles: Array<InstitutionalRole | string>) {
  const normalizedAllowed = new Set(
    allowedRoles.map((r) => String(r).toLowerCase())
  );

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.authUser || !req.authProfile) {
        throw new UnauthorizedError(
          'Authentication is required to access this institutional resource.',
          'AUTHENTICATION_REQUIRED'
        );
      }

      const actualRole = String(req.authProfile.role).toLowerCase();
      if (!normalizedAllowed.has(actualRole)) {
        await recordAuditEvent({
          actorUid: req.authProfile.uid,
          actorEmail: req.authProfile.email,
          actorRole: req.authProfile.role,
          targetUid: null,
          module: 'rbac',
          action: 'CROSS_ROLE_ACCESS_DENIED',
          outcome: 'denied',
          metadata: {
            path: req.originalUrl,
            method: req.method,
            actualRole,
            requiredRoles: Array.from(normalizedAllowed),
          },
        });
        throw new ForbiddenError(
          `Role "${actualRole}" is not authorised for this operation. Required: ${Array.from(normalizedAllowed).join(', ')}.`,
          'ROLE_FORBIDDEN'
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAdmin = requireRole(InstitutionalRole.ADMIN);

/**
 * 3. `requireDepartmentScope`:
 * Enforces actual department isolation for Department Coordinators (and Faculty where applicable).
 * Admins have institutional scope across all departments; Coordinators are restricted to
 * their exact `profile.departmentId` from Firestore.
 */
export function requireDepartmentScope(
  resolveTargetDepartment: (req: Request) => string | undefined | null
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.authUser || !req.authProfile) {
        throw new UnauthorizedError(
          'Authentication is required.',
          'AUTHENTICATION_REQUIRED'
        );
      }

      if (req.authProfile.role === InstitutionalRole.ADMIN) {
        next();
        return;
      }

      const targetDepartment = (resolveTargetDepartment(req) ?? '').trim().toUpperCase();
      const userDepartment = (req.authProfile.departmentId ?? '').trim().toUpperCase();

      if (!targetDepartment || !userDepartment || targetDepartment !== userDepartment) {
        await recordAuditEvent({
          actorUid: req.authProfile.uid,
          actorEmail: req.authProfile.email,
          actorRole: req.authProfile.role,
          targetUid: null,
          module: 'rbac',
          action: 'DEPARTMENT_SCOPE_DENIED',
          outcome: 'denied',
          metadata: {
            path: req.originalUrl,
            userDepartment,
            targetDepartment,
          },
        });
        throw new ForbiddenError(
          `Department scope violation: Coordinator for "${userDepartment || 'unassigned'}" cannot access or approve resources belonging to department "${targetDepartment || 'unknown'}".`,
          'DEPARTMENT_SCOPE_FORBIDDEN'
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 4. `requireFacultyOwnership`:
 * Enforces personal timetable and request isolation for Faculty accounts.
 * Faculty can view or create requests only for their own `profile.facultyId` (e.g. `F01`).
 */
export function requireFacultyOwnership(
  resolveTargetFacultyId: (req: Request) => string | undefined | null
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.authUser || !req.authProfile) {
        throw new UnauthorizedError(
          'Authentication is required.',
          'AUTHENTICATION_REQUIRED'
        );
      }

      if (req.authProfile.role === InstitutionalRole.ADMIN) {
        next();
        return;
      }

      if (req.authProfile.role !== InstitutionalRole.FACULTY) {
        throw new ForbiddenError(
          'Only Faculty or Admin accounts can access faculty-scoped resources.',
          'FACULTY_ROLE_REQUIRED'
        );
      }

      const targetFacultyId = (resolveTargetFacultyId(req) ?? '').trim().toUpperCase();
      const ownedFacultyId = (req.authProfile.facultyId ?? '').trim().toUpperCase();

      if (!targetFacultyId || !ownedFacultyId || targetFacultyId !== ownedFacultyId) {
        await recordAuditEvent({
          actorUid: req.authProfile.uid,
          actorEmail: req.authProfile.email,
          actorRole: req.authProfile.role,
          targetUid: null,
          module: 'rbac',
          action: 'FACULTY_OWNERSHIP_DENIED',
          outcome: 'denied',
          metadata: {
            path: req.originalUrl,
            ownedFacultyId,
            targetFacultyId,
          },
        });
        throw new ForbiddenError(
          `Faculty ownership violation: Faculty "${ownedFacultyId || 'unassigned'}" cannot access timetable or requests belonging to "${targetFacultyId || 'unknown'}".`,
          'FACULTY_OWNERSHIP_FORBIDDEN'
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 5. `requireClubOwnership`:
 * Enforces club isolation for Club Representatives.
 * Club Representatives can view, submit, or cancel only their own club's requests (`profile.clubId`).
 */
export function requireClubOwnership(
  resolveTargetClubId: (req: Request) => string | undefined | null
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.authUser || !req.authProfile) {
        throw new UnauthorizedError(
          'Authentication is required.',
          'AUTHENTICATION_REQUIRED'
        );
      }

      if (req.authProfile.role === InstitutionalRole.ADMIN) {
        next();
        return;
      }

      if (req.authProfile.role !== InstitutionalRole.CLUB) {
        throw new ForbiddenError(
          'Only Club Representative or Admin accounts can access club-scoped resources.',
          'CLUB_ROLE_REQUIRED'
        );
      }

      const targetClubId = (resolveTargetClubId(req) ?? '').trim().toLowerCase();
      const ownedClubId = (req.authProfile.clubId ?? '').trim().toLowerCase();

      if (!targetClubId || !ownedClubId || targetClubId !== ownedClubId) {
        await recordAuditEvent({
          actorUid: req.authProfile.uid,
          actorEmail: req.authProfile.email,
          actorRole: req.authProfile.role,
          targetUid: null,
          module: 'rbac',
          action: 'CLUB_OWNERSHIP_DENIED',
          outcome: 'denied',
          metadata: {
            path: req.originalUrl,
            ownedClubId,
            targetClubId,
          },
        });
        throw new ForbiddenError(
          `Club ownership violation: Club "${ownedClubId || 'unassigned'}" cannot access or modify bookings belonging to "${targetClubId || 'unknown'}".`,
          'CLUB_OWNERSHIP_FORBIDDEN'
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 6. `requireAdminApprovalAuthority`:
 * Enforces institutional Admin authority for operations that cannot be approved by
 * Department Coordinators, Faculty, or Club Representatives (e.g. institute-wide events,
 * master timetable publication, rescheduling repairs, user management).
 */
export async function requireAdminApprovalAuthority(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser || !req.authProfile) {
      throw new UnauthorizedError(
        'Authentication is required.',
        'AUTHENTICATION_REQUIRED'
      );
    }

    if (req.authProfile.role !== InstitutionalRole.ADMIN) {
      await recordAuditEvent({
        actorUid: req.authProfile.uid,
        actorEmail: req.authProfile.email,
        actorRole: req.authProfile.role,
        targetUid: null,
        module: 'rbac',
        action: 'ADMIN_APPROVAL_AUTHORITY_DENIED',
        outcome: 'denied',
        metadata: {
          path: req.originalUrl,
          actorRole: req.authProfile.role,
        },
      });
      throw new ForbiddenError(
        'Institutional Admin approval authority is required for this decision. Request must be escalated to the Dean’s Office.',
        'ADMIN_APPROVAL_AUTHORITY_REQUIRED'
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 7. `enforceSeparationOfDuties`:
 * Enforces the institutional Separation of Duties rule:
 * "Nobody can approve their own request."
 * Compares the authenticated approver UID (`req.authProfile.uid`) with the original requester UID.
 */
export function enforceSeparationOfDuties(
  resolveRequesterUid: (req: Request) => Promise<string | undefined | null> | string | undefined | null
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.authUser || !req.authProfile) {
        throw new UnauthorizedError(
          'Authentication is required.',
          'AUTHENTICATION_REQUIRED'
        );
      }

      // Reject any frontend-supplied approval role override
      const bodyObj = (req.body ?? {}) as Record<string, unknown>;
      if (
        typeof bodyObj.approverRole === 'string' &&
        bodyObj.approverRole.toLowerCase() !== req.authProfile.role
      ) {
        await recordAuditEvent({
          actorUid: req.authProfile.uid,
          actorEmail: req.authProfile.email,
          actorRole: req.authProfile.role,
          targetUid: null,
          module: 'rbac',
          action: 'CLIENT_APPROVAL_ROLE_REJECTED',
          outcome: 'denied',
          metadata: {
            attemptedApproverRole: bodyObj.approverRole,
            actualRole: req.authProfile.role,
          },
        });
        throw new ForbiddenError(
          'Client-provided approval role override is forbidden.',
          'UNTRUSTED_APPROVAL_ROLE'
        );
      }

      // Faculty and Club Representatives have zero approval authority
      if (
        req.authProfile.role === InstitutionalRole.FACULTY ||
        req.authProfile.role === InstitutionalRole.CLUB
      ) {
        await recordAuditEvent({
          actorUid: req.authProfile.uid,
          actorEmail: req.authProfile.email,
          actorRole: req.authProfile.role,
          targetUid: null,
          module: 'rbac',
          action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
          outcome: 'denied',
          metadata: {
            path: req.originalUrl,
            actorRole: req.authProfile.role,
          },
        });
        throw new ForbiddenError(
          `Role "${req.authProfile.role}" does not possess approval authority.`,
          'INSUFFICIENT_APPROVAL_AUTHORITY'
        );
      }

      const requesterUid = (await resolveRequesterUid(req))?.trim();
      if (requesterUid && requesterUid === req.authProfile.uid) {
        await recordAuditEvent({
          actorUid: req.authProfile.uid,
          actorEmail: req.authProfile.email,
          actorRole: req.authProfile.role,
          targetUid: requesterUid,
          module: 'rbac',
          action: 'SELF_APPROVAL_REJECTED',
          outcome: 'denied',
          metadata: {
            path: req.originalUrl,
            approverUid: req.authProfile.uid,
            requesterUid,
          },
        });
        throw new ForbiddenError(
          'Separation of duties violation: An institutional user cannot approve their own request.',
          'SELF_APPROVAL_FORBIDDEN'
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * CSRF protection helper for state-changing requests when a CSRF cookie is present.
 */
export function verifyCsrfIfCookiePresent(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const cookies = parseCookieHeader(req.header('cookie'));
  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeader = req.header('x-csrf-token');

  if (csrfCookie && csrfHeader && csrfCookie !== csrfHeader) {
    next(
      new ForbiddenError(
        'CSRF token mismatch on state-changing request.',
        'CSRF_TOKEN_MISMATCH'
      )
    );
    return;
  }

  next();
}
