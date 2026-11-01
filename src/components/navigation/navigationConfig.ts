import {
  Activity,
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Database,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  PlusCircle,
  RefreshCw,
  Settings,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { InstitutionalRole } from '../../../types/domain.types.ts';

export const CIT_CREST_URL = '/assets/aistudio/cit_1.jpg_5064815d.png';

export interface NavigationDestination {
  readonly path: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly breadcrumb: string;
}

export interface NavigationSection {
  readonly sectionTitle: string;
  readonly items: readonly NavigationDestination[];
}

/**
 * ADMIN NAVIGATION — 15 independent destinations matching the 1st Admin screen from Stitch.
 */
export const ADMIN_NAVIGATION_SECTIONS: readonly NavigationSection[] = [
  {
    sectionTitle: 'OVERVIEW',
    items: [
      {
        path: '/admin/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        breadcrumb: 'Overview',
      },
    ],
  },
  {
    sectionTitle: 'ACADEMIC OPERATIONS',
    items: [
      {
        path: '/admin/timetable',
        label: 'Timetable Management',
        icon: Calendar,
        breadcrumb: 'Timetable Management',
      },
      {
        path: '/admin/examinations',
        label: 'Examination Scheduler',
        icon: ClipboardCheck,
        breadcrumb: 'Examination Scheduler',
      },
    ],
  },
  {
    sectionTitle: 'VENUE OPERATIONS',
    items: [
      {
        path: '/admin/bookings',
        label: 'Venue Bookings',
        icon: Building2,
        breadcrumb: 'Venue Bookings',
      },
      {
        path: '/admin/spectra-week',
        label: 'Spectra Week',
        icon: CalendarClock,
        breadcrumb: 'Spectra Week Operations',
      },
      {
        path: '/admin/room-intelligence',
        label: 'Room Intelligence',
        icon: BarChart3,
        breadcrumb: 'Room Intelligence',
      },
    ],
  },
  {
    sectionTitle: 'INTELLIGENCE',
    items: [
      {
        path: '/admin/rescheduling',
        label: 'Dynamic Rescheduling',
        icon: RefreshCw,
        breadcrumb: 'Dynamic Rescheduling',
      },
      {
        path: '/admin/ai-assistant',
        label: 'AI Scheduling Assistant',
        icon: Sparkles,
        breadcrumb: 'AI Scheduling Assistant',
      },
      {
        path: '/admin/decision-intelligence',
        label: 'Decision Intelligence',
        icon: Activity,
        breadcrumb: 'Decision Intelligence',
      },
    ],
  },
  {
    sectionTitle: 'ADMINISTRATION',
    items: [
      {
        path: '/admin/manual-scheduling',
        label: 'Manual Scheduling',
        icon: Wrench,
        breadcrumb: 'Manual Scheduling',
      },
      {
        path: '/admin/reports',
        label: 'Reports & Exports',
        icon: FileSpreadsheet,
        breadcrumb: 'Reports & Exports',
      },
      {
        path: '/admin/datasets',
        label: 'Dataset Management',
        icon: Database,
        breadcrumb: 'Dataset Management',
      },
      {
        path: '/admin/users',
        label: 'User & Role Management',
        icon: Users,
        breadcrumb: 'User & Role Management',
      },
      {
        path: '/admin/audit-logs',
        label: 'Audit Logs',
        icon: Clock,
        breadcrumb: 'Audit Logs',
      },
      {
        path: '/admin/settings',
        label: 'Settings',
        icon: Settings,
        breadcrumb: 'Institutional Settings',
      },
    ],
  },
];

/**
 * DEPARTMENT COORDINATOR NAVIGATION — Exactly 3 independent destinations in fixed order.
 */
export const COORDINATOR_NAVIGATION_SECTIONS: readonly NavigationSection[] = [
  {
    sectionTitle: 'DEPARTMENT OPERATIONS',
    items: [
      {
        path: '/coordinator/department-event-bookings',
        label: 'Department Event Bookings',
        icon: Building2,
        breadcrumb: 'Department Event Bookings',
      },
      {
        path: '/coordinator/session-change-requests',
        label: 'Session Change Requests',
        icon: RefreshCw,
        breadcrumb: 'Session Change Requests',
      },
      {
        path: '/coordinator/lab-booking-approvals',
        label: 'Lab Booking Approvals',
        icon: CheckSquare,
        breadcrumb: 'Lab Booking Approvals',
      },
    ],
  },
];

/**
 * FACULTY NAVIGATION — Exactly 3 independent destinations in fixed order.
 */
export const FACULTY_NAVIGATION_SECTIONS: readonly NavigationSection[] = [
  {
    sectionTitle: 'MY SCHEDULING',
    items: [
      {
        path: '/faculty/timetable',
        label: 'My Timetable',
        icon: Calendar,
        breadcrumb: 'My Timetable',
      },
      {
        path: '/faculty/scheduling-requests',
        label: 'Scheduling Requests',
        icon: ClipboardCheck,
        breadcrumb: 'Scheduling Requests',
      },
      {
        path: '/faculty/session-relocation',
        label: 'Session Relocation',
        icon: RefreshCw,
        breadcrumb: 'Session Relocation',
      },
    ],
  },
];

/**
 * CLUB REPRESENTATIVE NAVIGATION — Exactly 2 independent destinations in fixed order.
 */
export const CLUB_NAVIGATION_SECTIONS: readonly NavigationSection[] = [
  {
    sectionTitle: 'CLUB OPERATIONS',
    items: [
      {
        path: '/club/submit-venue-request',
        label: 'Submit Venue Request',
        icon: PlusCircle,
        breadcrumb: 'Submit Venue Request',
      },
      {
        path: '/club/my-venue-requests',
        label: 'My Venue Requests',
        icon: FolderKanban,
        breadcrumb: 'My Venue Requests',
      },
    ],
  },
];

export function getNavigationForRole(role: InstitutionalRole | string): readonly NavigationSection[] {
  switch (role) {
    case InstitutionalRole.ADMIN:
    case 'ADMIN':
      return ADMIN_NAVIGATION_SECTIONS;
    case InstitutionalRole.DEPARTMENT_COORDINATOR:
    case 'DEPARTMENT_COORDINATOR':
      return COORDINATOR_NAVIGATION_SECTIONS;
    case InstitutionalRole.FACULTY:
    case 'FACULTY':
      return FACULTY_NAVIGATION_SECTIONS;
    case InstitutionalRole.CLUB:
    case 'CLUB':
    case 'CLUB_REPRESENTATIVE':
      return CLUB_NAVIGATION_SECTIONS;
    default:
      return ADMIN_NAVIGATION_SECTIONS;
  }
}
