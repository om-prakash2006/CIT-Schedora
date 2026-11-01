/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth, getRoleDefaultRoute } from './context/AuthContext.tsx';
import {
  ProtectedRoute,
  renderRoleHomeScreen,
} from './components/routing/ProtectedRoute.tsx';

// Auth & Dev Status Pages
import { LoginPage } from './pages/auth/LoginPage.tsx';
import { SystemStatusPage } from './pages/dev/SystemStatusPage.tsx';

// Admin Pages (15 Independent Screens)
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage.tsx';
import { AdminTimetablePage } from './pages/admin/AdminTimetablePage.tsx';
import { AdminExaminationsPage } from './pages/admin/AdminExaminationsPage.tsx';
import { AdminBookingsPage } from './pages/admin/AdminBookingsPage.tsx';
import { AdminSpectraWeekPage } from './pages/admin/AdminSpectraWeekPage.tsx';
import { AdminRoomIntelligencePage } from './pages/admin/AdminRoomIntelligencePage.tsx';
import { AdminReschedulingPage } from './pages/admin/AdminReschedulingPage.tsx';
import { AdminAiAssistantPage } from './pages/admin/AdminAiAssistantPage.tsx';
import { AdminDecisionIntelligencePage } from './pages/admin/AdminDecisionIntelligencePage.tsx';
import { AdminManualSchedulingPage } from './pages/admin/AdminManualSchedulingPage.tsx';
import { AdminReportsPage } from './pages/admin/AdminReportsPage.tsx';
import { AdminDatasetsPage } from './pages/admin/AdminDatasetsPage.tsx';
import { AdminUsersPage } from './pages/admin/AdminUsersPage.tsx';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage.tsx';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage.tsx';

// Department Coordinator Pages (3 Independent Screens)
import { CoordinatorEventBookingsPage } from './pages/coordinator/CoordinatorEventBookingsPage.tsx';
import { CoordinatorSessionChangesPage } from './pages/coordinator/CoordinatorSessionChangesPage.tsx';
import { CoordinatorLabApprovalsPage } from './pages/coordinator/CoordinatorLabApprovalsPage.tsx';

// Faculty Pages (3 Independent Screens)
import { FacultyTimetablePage } from './pages/faculty/FacultyTimetablePage.tsx';
import { FacultySchedulingRequestsPage } from './pages/faculty/FacultySchedulingRequestsPage.tsx';
import { FacultySessionRelocationPage } from './pages/faculty/FacultySessionRelocationPage.tsx';

// Club Representative Pages (2 Independent Screens)
import { ClubSubmitVenueRequestPage } from './pages/club/ClubSubmitVenueRequestPage.tsx';
import { ClubMyVenueRequestsPage } from './pages/club/ClubMyVenueRequestsPage.tsx';

function RootEntryRedirect() {
  const { authenticated, user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (authenticated && user) {
      navigate(getRoleDefaultRoute(user.role), { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [authenticated, user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6FA] text-[#182238]">
        <div className="text-sm font-medium text-[#294074]">
          Loading CIT Schedora...
        </div>
      </div>
    );
  }

  if (authenticated && user) {
    return renderRoleHomeScreen(user.role);
  }

  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Root Entry -> Redirects to /login when unauthenticated */}
      <Route path="/" element={<RootEntryRedirect />} />

      {/* Unified Institutional Sign In */}
      <Route path="/login" element={<LoginPage />} />

      {/* Developer-Only System Status Route (Never in normal user navigation) */}
      <Route path="/dev/system-status" element={<SystemStatusPage />} />

      {/* Admin Workspace Routes (15 Independent Screens) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/timetable"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminTimetablePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/examinations"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminExaminationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/bookings"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminBookingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/spectra-week"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminSpectraWeekPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/room-intelligence"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminRoomIntelligencePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/rescheduling"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminReschedulingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ai-assistant"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminAiAssistantPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/decision-intelligence"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminDecisionIntelligencePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/manual-scheduling"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminManualSchedulingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/datasets"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminDatasetsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminAuditLogsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminSettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Department Coordinator Workspace Routes (3 Independent Screens) */}
      <Route
        path="/coordinator"
        element={
          <ProtectedRoute allowedRoles={['DEPARTMENT_COORDINATOR']}>
            <CoordinatorEventBookingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/department-event-bookings"
        element={
          <ProtectedRoute allowedRoles={['DEPARTMENT_COORDINATOR']}>
            <CoordinatorEventBookingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/session-change-requests"
        element={
          <ProtectedRoute allowedRoles={['DEPARTMENT_COORDINATOR']}>
            <CoordinatorSessionChangesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/lab-booking-approvals"
        element={
          <ProtectedRoute allowedRoles={['DEPARTMENT_COORDINATOR']}>
            <CoordinatorLabApprovalsPage />
          </ProtectedRoute>
        }
      />

      {/* Faculty Workspace Routes (3 Independent Screens) */}
      <Route
        path="/faculty"
        element={
          <ProtectedRoute allowedRoles={['FACULTY']}>
            <FacultyTimetablePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/timetable"
        element={
          <ProtectedRoute allowedRoles={['FACULTY']}>
            <FacultyTimetablePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/scheduling-requests"
        element={
          <ProtectedRoute allowedRoles={['FACULTY']}>
            <FacultySchedulingRequestsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/session-relocation"
        element={
          <ProtectedRoute allowedRoles={['FACULTY']}>
            <FacultySessionRelocationPage />
          </ProtectedRoute>
        }
      />

      {/* Club Representative Workspace Routes (2 Independent Screens) */}
      <Route
        path="/club"
        element={
          <ProtectedRoute allowedRoles={['CLUB_REPRESENTATIVE']}>
            <ClubSubmitVenueRequestPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/club/submit-venue-request"
        element={
          <ProtectedRoute allowedRoles={['CLUB_REPRESENTATIVE']}>
            <ClubSubmitVenueRequestPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/club/my-venue-requests"
        element={
          <ProtectedRoute allowedRoles={['CLUB_REPRESENTATIVE']}>
            <ClubMyVenueRequestsPage />
          </ProtectedRoute>
        }
      />

      {/* Unknown routes handled safely */}
      <Route path="*" element={<RootEntryRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
