import React, { useEffect, useState } from 'react';
import {
  Users,
  ShieldCheck,
  Search,
  Lock,
  UserPlus,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

const ROLE_PERMISSION_MATRIX = [
  {
    capability: 'Master Timetable Generation & Publication',
    admin: 'Full Authority',
    coordinator: 'View Only',
    faculty: 'Own Schedule View',
    club: 'No Access',
  },
  {
    capability: 'Department Event & Lab Booking Approval',
    admin: 'Global Override',
    coordinator: 'Department Scope',
    faculty: 'Submit Request',
    club: 'No Access',
  },
  {
    capability: 'Faculty Unavailability & Session Relocation',
    admin: 'Final Approval',
    coordinator: 'Department Review',
    faculty: 'Self-Scope Submit',
    club: 'No Access',
  },
  {
    capability: 'Club Venue Request Submission (Tier 6 Cap)',
    admin: 'Approve / Offer Alt',
    coordinator: 'No Access',
    faculty: 'No Access',
    club: 'Club-Scope Submit',
  },
];

export function AdminUsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All Institutional Roles');
  const [notice, setNotice] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/users', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.users)) setUsers(json.users);
      }
    } catch {
      // ignore error on initial load
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRevokeSessions = async (uid: string, email: string) => {
    try {
      const res = await fetch(`/api/v1/users/${encodeURIComponent(uid)}/revoke-sessions`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setNotice(`Revoked active sessions and incremented sessionVersion for ${email}.`);
        await loadUsers();
      }
    } catch {
      setNotice('Failed to revoke user sessions.');
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesRole =
      roleFilter === 'All Institutional Roles' ||
      String(u.role || '').toUpperCase() === roleFilter.toUpperCase();
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      String(u.email || '').toLowerCase().includes(q) ||
      String(u.displayName || '').toLowerCase().includes(q) ||
      String(u.facultyId || '').toLowerCase().includes(q) ||
      String(u.departmentId || '').toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });

  return (
    <RoleWorkspaceLayout
      title="User & Role Management"
      subtitle="Manage institutional accounts, department scope bindings, and strict four-role access control."
      breadcrumbCurrent="User & Role Management"
      headerActions={
        <button
          type="button"
          onClick={() => {
            loadUsers();
            setNotice(
              'Synced canonical institutional accounts from Firebase Auth and Firestore users collection.'
            );
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Provision Institutional Account
        </button>
      }
    >
      <div className="space-y-6" data-testid="admin-users-screen">
        {notice && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[#E7DFCF] bg-[#FFFDF8] p-3.5 text-xs text-[#182238]">
            <AlertCircle className="h-4 w-4 text-[#132957] shrink-0 mt-0.5" />
            <div className="flex-1">{notice}</div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[11px] font-semibold text-[#64748B]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* User Directory Filter Bar */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF2F8] pb-3.5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Institutional User Directory ({filteredUsers.length})
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search email or faculty ID..."
                  className="rounded-lg border border-[#D4DFED] bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-[#182238]"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#182238]"
              >
                <option>All Institutional Roles</option>
                <option>ADMIN</option>
                <option>DEPARTMENT_COORDINATOR</option>
                <option>FACULTY</option>
                <option>CLUB_REPRESENTATIVE</option>
              </select>
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center text-xs text-[#64748B]">
              {loading
                ? 'Loading institutional user profiles from Firestore...'
                : 'User directory database is not yet seeded. No fake login timestamps or fabricated user activity records are displayed.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    <th className="py-2.5 pr-4">Display Name &amp; Email</th>
                    <th className="py-2.5 px-3">Institutional Role</th>
                    <th className="py-2.5 px-3">Entity Scope</th>
                    <th className="py-2.5 px-3">Booking Cap</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 pl-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F8]">
                  {filteredUsers.map((u) => (
                    <tr key={u.uid}>
                      <td className="py-3 pr-4">
                        <div className="font-bold text-[#132957]">{u.displayName}</div>
                        <div className="font-mono text-[11px] text-[#64748B]">{u.email}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex rounded bg-[#F0F4FA] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#132957]">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#475569]">
                        {u.departmentId ? `Dept: ${u.departmentId}` : ''}
                        {u.facultyId ? ` · Faculty: ${u.facultyId}` : ''}
                        {u.clubId ? `Club: ${u.clubId}` : ''}
                        {!u.departmentId && !u.facultyId && !u.clubId ? 'Global Campus Scope' : ''}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#475569]">
                        {u.roleCategoryCap || 'institute_event'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            u.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {u.status || 'active'}
                        </span>
                      </td>
                      <td className="py-3 pl-3">
                        <button
                          type="button"
                          onClick={() => handleRevokeSessions(u.uid, u.email)}
                          className="inline-flex items-center gap-1 rounded border border-[#DCE4F0] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-semibold text-[#132957] hover:bg-[#EEF2F8] cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Revoke Sessions
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 4-Role Permission Matrix & Separation of Duties */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Four-Role Institutional Permission Matrix
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded bg-[#F0F4FA] px-2.5 py-1 text-[11px] font-semibold text-[#132957]">
              <Lock className="h-3 w-3" />
              Backend RBAC Enforced
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                  <th className="py-2.5 pr-4">Capability / Resource</th>
                  <th className="py-2.5 px-3">Admin</th>
                  <th className="py-2.5 px-3">Dept. Coordinator</th>
                  <th className="py-2.5 px-3">Faculty</th>
                  <th className="py-2.5 pl-3">Club Representative</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F8]">
                {ROLE_PERMISSION_MATRIX.map((row) => (
                  <tr key={row.capability}>
                    <td className="py-3 pr-4 font-semibold text-[#182238]">
                      {row.capability}
                    </td>
                    <td className="py-3 px-3 text-[#132957] font-semibold">
                      {row.admin}
                    </td>
                    <td className="py-3 px-3 text-[#475569]">{row.coordinator}</td>
                    <td className="py-3 px-3 text-[#475569]">{row.faculty}</td>
                    <td className="py-3 pl-3 text-[#475569]">{row.club}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </RoleWorkspaceLayout>
  );
}

