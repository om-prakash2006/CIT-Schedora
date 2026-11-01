import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getRoleDefaultRoute,
  normalizeRole,
  type RoleIdentifier,
  useAuth,
} from '../../context/AuthContext.tsx';
import { LoginPage } from '../../pages/auth/LoginPage.tsx';
import { AdminDashboardPage } from '../../pages/admin/AdminDashboardPage.tsx';
import { CoordinatorEventBookingsPage } from '../../pages/coordinator/CoordinatorEventBookingsPage.tsx';
import { FacultyTimetablePage } from '../../pages/faculty/FacultyTimetablePage.tsx';
import { ClubSubmitVenueRequestPage } from '../../pages/club/ClubSubmitVenueRequestPage.tsx';
import { InstitutionalRole } from '../../../types/domain.types.ts';

export interface ProtectedRouteProps {
  allowedRole?: RoleIdentifier;
  allowedRoles?: readonly RoleIdentifier[];
  children: React.ReactNode;
}

export function renderRoleHomeScreen(role: RoleIdentifier): React.ReactElement {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case InstitutionalRole.ADMIN:
      return <AdminDashboardPage />;
    case InstitutionalRole.DEPARTMENT_COORDINATOR:
      return <CoordinatorEventBookingsPage />;
    case InstitutionalRole.FACULTY:
      return <FacultyTimetablePage />;
    case InstitutionalRole.CLUB:
      return <ClubSubmitVenueRequestPage />;
    default:
      return <LoginPage />;
  }
}

export function ProtectedRoute({
  allowedRole,
  allowedRoles,
  children,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const permittedNormalizedRoles = (
    allowedRoles ?? (allowedRole ? [allowedRole] : [])
  ).map(normalizeRole);

  const userNormalizedRole = user ? normalizeRole(user.role) : null;
  const isAuthorized =
    Boolean(userNormalizedRole) &&
    permittedNormalizedRoles.includes(userNormalizedRole!);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate('/login', {
        replace: true,
        state: { from: location.pathname },
      });
    } else if (!isAuthorized) {
      navigate(getRoleDefaultRoute(user.role), { replace: true });
    }
  }, [isLoading, user, isAuthorized, navigate, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFDF8] text-[#182238]">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-[#294074] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-600">
            Verifying institutional session...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!isAuthorized) {
    return renderRoleHomeScreen(user.role);
  }

  return <>{children}</>;
}
