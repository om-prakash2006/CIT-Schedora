/**
 * Four fixed institutional roles enforced by CIT Schedora backend.
 * Role assignment is strictly determined by authenticated backend records.
 */
export const InstitutionalRole = {
  ADMIN: 'admin',
  DEPARTMENT_COORDINATOR: 'department_coordinator',
  FACULTY: 'faculty',
  CLUB: 'club',
} as const;

export type InstitutionalRole = (typeof InstitutionalRole)[keyof typeof InstitutionalRole];

/**
 * Institutional venue booking priority order (highest to lowest):
 * 1. Exams
 * 2. Regular classes
 * 3. Institute events
 * 4. Guest lectures
 * 5. Department events
 * 6. Club events
 */
export const BookingPriorityCategory = {
  EXAM: 'exam',
  REGULAR_CLASS: 'regular_class',
  INSTITUTE_EVENT: 'institute_event',
  GUEST_LECTURE: 'guest_lecture',
  DEPARTMENT_EVENT: 'department_event',
  CLUB_EVENT: 'club_event',
} as const;

export type BookingPriorityCategory = (typeof BookingPriorityCategory)[keyof typeof BookingPriorityCategory];

export const BookingDecisionStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ALTERNATIVE_OFFERED: 'alternative_offered',
  CANCELLED: 'cancelled',
} as const;

export type BookingDecisionStatus = (typeof BookingDecisionStatus)[keyof typeof BookingDecisionStatus];

/**
 * Official disruption change types supported by the dynamic rescheduling engine.
 */
export const DisruptionChangeType = {
  FACULTY_UNAVAILABLE: 'faculty_unavailable',
  ROOM_UNAVAILABLE: 'room_unavailable',
  ADD_FACULTY: 'add_faculty',
  ADD_SESSION: 'add_session',
  REMOVE_SESSION: 'remove_session',
} as const;

export type DisruptionChangeType = (typeof DisruptionChangeType)[keyof typeof DisruptionChangeType];

export const RequestLifecycleState = {
  REQUEST_CREATED: 'request_created',
  AUTHENTICATED_USER_VERIFIED: 'authenticated_user_verified',
  STRUCTURED_REQUEST_VALIDATION: 'structured_request_validation',
  INSTITUTIONAL_RULE_CHECKS: 'institutional_rule_checks',
  DETERMINISTIC_FEASIBILITY_EVALUATION: 'deterministic_feasibility_evaluation',
  AUTHORISED_APPROVAL_ROUTING: 'authorised_approval_routing',
  DECIDED: 'decided',
  BACKEND_PERSISTED: 'backend_persisted',
  AUDIT_RECORDED: 'audit_recorded',
  USER_STATUS_UPDATED: 'user_status_updated',
} as const;

export type RequestLifecycleState = (typeof RequestLifecycleState)[keyof typeof RequestLifecycleState];

export const AccountStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DISABLED: 'disabled',
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export interface EffectivePermissions {
  readonly role: InstitutionalRole;
  readonly allowedRoutes: readonly string[];
  readonly allowedScreens: readonly string[];
  readonly canApproveInstitutionalBookings: boolean;
  readonly canApproveDepartmentLabBookings: boolean;
  readonly canApproveOwnRequests: false;
  readonly canManageUsers: boolean;
  readonly canManageDatasets: boolean;
  readonly canRunSchedulers: boolean;
  readonly departmentScope: string | null;
  readonly facultyScope: string | null;
  readonly clubScope: string | null;
}

export interface AuthenticatedSessionPrincipal {
  readonly uid: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: InstitutionalRole;
  readonly departmentId?: string;
  readonly facultyId?: string;
  readonly clubId?: string;
  readonly organisationName?: string;
  readonly accountStatus: AccountStatus;
  readonly authorizationVersion: number;
  readonly permissions?: EffectivePermissions;
}

/**
 * Future service boundary contracts for subsequent implementation milestones.
 */
export interface ServiceBoundaryMetadata {
  readonly serviceName: string;
  readonly configured: boolean;
  readonly targetMilestone: string;
}

