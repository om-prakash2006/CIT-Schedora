import React from 'react';
import { Bell, LogOut, Search } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { InstitutionalRole } from '../../../types/domain.types.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  CIT_CREST_URL,
  getNavigationForRole,
} from '../navigation/navigationConfig.ts';

export interface RoleWorkspaceLayoutProps {
  title?: string;
  subtitle?: string;
  breadcrumbCurrent?: string;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
}

function getRoleDisplayMeta(
  role: InstitutionalRole | string,
  email: string,
  displayName?: string,
  departmentId?: string,
  facultyId?: string,
  organisationName?: string
) {
  switch (role) {
    case InstitutionalRole.ADMIN:
    case 'ADMIN':
      return {
        initials: 'AS',
        displayName: displayName || email || 'Prof. A. Sharma',
        subLabel: "Dean's Office (Admin)",
        sidebarBadge: null,
      };
    case InstitutionalRole.DEPARTMENT_COORDINATOR:
    case 'DEPARTMENT_COORDINATOR':
      return {
        initials: 'DC',
        displayName: displayName || email || 'Department Coordinator',
        subLabel: `Dept. Coordinator (${departmentId ?? 'CSE'})`,
        sidebarBadge: `DEPARTMENT COORDINATOR · ${departmentId ?? 'CSE'}`,
      };
    case InstitutionalRole.FACULTY:
    case 'FACULTY':
      return {
        initials: 'FC',
        displayName: displayName || email || 'Faculty Member',
        subLabel: `${facultyId ?? 'FAC-014'} · ${departmentId ?? 'CSE'} Dept.`,
        sidebarBadge: `FACULTY MEMBER · DEPT. OF ${departmentId ?? 'CSE'}`,
      };
    case InstitutionalRole.CLUB:
    case 'CLUB':
    case 'CLUB_REPRESENTATIVE':
      return {
        initials: 'CR',
        displayName: displayName || email || 'Club Representative',
        subLabel: organisationName ?? 'Student Club Representative',
        sidebarBadge: `CLUB REPRESENTATIVE · ${organisationName ?? 'CAMPUS CLUB'}`,
      };
    default:
      return {
        initials: 'AS',
        displayName: displayName || email || 'Institutional User',
        subLabel: 'Campus Workspace',
        sidebarBadge: null,
      };
  }
}

export function RoleWorkspaceLayout({
  title,
  subtitle,
  breadcrumbCurrent,
  headerActions,
  children,
}: RoleWorkspaceLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const activeRole = user?.role ?? InstitutionalRole.ADMIN;
  const sections = getNavigationForRole(activeRole);
  const allItems = sections.flatMap((section) => section.items);
  const currentItem =
    allItems.find((item) => item.path === location.pathname) ?? allItems[0];

  const roleMeta = getRoleDisplayMeta(
    activeRole,
    user?.email ?? '',
    user?.displayName,
    user?.departmentId ?? user?.department ?? undefined,
    user?.facultyId ?? undefined,
    user?.organisationName
  );

  async function handleSignOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex bg-[#F4F6FA] text-[#182238] font-sans">
      {/* Original Institutional Blue Sidebar (#132957 / #294074) */}
      <aside
        data-testid="institutional-sidebar"
        className="w-64 shrink-0 bg-[#132957] text-white flex flex-col select-none border-r border-[#294074]"
      >
        {/* Top Brand Block with Official CIT Crest */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-lg bg-white p-0.5 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
            <img
              src={CIT_CREST_URL}
              alt="Chilika Institute of Technology Crest"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="font-serif font-bold text-base leading-tight tracking-tight text-white truncate">
              CIT Schedora
            </div>
            <div className="text-[11px] text-blue-200/80 truncate">
              Campus Scheduling &amp; Venue ...
            </div>
          </div>
        </div>

        {roleMeta.sidebarBadge && (
          <div className="mx-3 mt-3 px-2.5 py-1.5 rounded-md bg-[#294074]/70 border border-white/10 text-[10px] font-semibold tracking-wider text-[#FBEFA3] uppercase">
            {roleMeta.sidebarBadge}
          </div>
        )}

        {/* Role-Scoped Navigation Links */}
        <nav
          className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
          aria-label="Institutional Workspace Navigation"
        >
          {sections.map((section) => (
            <div key={section.sectionTitle}>
              <div className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-wider text-blue-300/75 uppercase">
                {section.sectionTitle}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          `w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                            isActive
                              ? 'bg-[#294074] text-white shadow-2xs ring-1 ring-white/15'
                              : 'text-blue-100/80 hover:bg-white/5 hover:text-white'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0 text-blue-200" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer & Sign Out */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium text-blue-100 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0 text-blue-200" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area with Unified Top Bar */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Canonical Top Header Bar (Same as 1st screen of Admin) */}
        <header className="h-16 bg-white border-b border-[#E7DFCF] px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Home</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-[#294074]">
              {breadcrumbCurrent ?? currentItem?.breadcrumb ?? 'Overview'}
            </span>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative w-72 hidden sm:block">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search slots, venues, cohort"
                placeholder="Search slots, venues, cohort..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#F8FAFC] border border-[#DCE4F0] rounded-lg text-xs text-[#182238] placeholder:text-slate-400 focus:outline-none focus:border-[#294074]"
              />
            </div>

            <button
              type="button"
              aria-label="Notifications"
              className="p-1.5 text-slate-500 hover:text-[#182238] rounded-md"
            >
              <Bell className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-[#E7DFCF]" />

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#132957] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {roleMeta.initials}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-semibold text-[#182238] truncate max-w-[160px]">
                  {roleMeta.displayName}
                </div>
                <div className="text-[11px] text-slate-500 truncate max-w-[160px]">
                  {roleMeta.subLabel}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Active Page Content */}
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {(title || subtitle || headerActions) && (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                {title && (
                  <h1 className="font-serif text-2xl font-bold text-[#132957]">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
                )}
              </div>
              {headerActions && <div>{headerActions}</div>}
            </div>
          )}
          {children ?? <Outlet />}
        </main>

        <footer className="px-8 py-4 border-t border-[#E7DFCF] text-[11px] text-slate-500 bg-white flex flex-wrap items-center justify-between gap-2">
          <span>
            © Chilika Institute of Technology | CIT Schedora — Campus Scheduling &amp; Venue Management
          </span>
          <span>Chilika Institute of Technology · Institutional Governance Protocol</span>
        </footer>
      </div>
    </div>
  );
}
