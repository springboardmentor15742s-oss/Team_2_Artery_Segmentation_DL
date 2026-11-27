import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  FileBarChart2,
  ClipboardPenLine,
  Flag,
  FlaskConical,
  FolderKanban,
  History,
  Image,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Stethoscope,
  UploadCloud,
  UserRound,
  Users,
  Trophy,
  ScanLine,
} from 'lucide-react';

const WORKSPACE_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/feature-management', label: 'Feature Management', icon: Flag },
  { path: '/cases', label: 'Cases', icon: FolderKanban, end: true },
  { path: '/patients', label: 'Patients', icon: Users },
  { path: '/ai-analysis', label: 'Image Analysis', icon: Activity },
  { path: '/xrays', label: 'Angiography Viewer', icon: Image },
  { path: '/stenosis-visualization', label: 'Segmentation & Visualization', icon: Activity },
  { path: '/upload', label: 'Upload Scan', icon: UploadCloud },
  { path: '/case-review', label: 'Doctor Review', icon: ClipboardPenLine },
  { path: '/reports', label: 'Results & Reports', icon: FileBarChart2 },
  { path: '/training', label: 'Model Evaluation', icon: BarChart3 },
  { path: '/model-comparison', label: 'Model Comparison', icon: BarChart3 },
  { path: '/stenosis-leaderboard', label: 'Stenosis Leaderboard', icon: Trophy },
  { path: '/segmentation-results', label: 'Vessel Segmentation Results', icon: ScanLine },
  { path: '/model-registry', label: 'Model Registry', icon: FlaskConical },
  { path: '/testing-suite', label: 'Testing Suites', icon: Activity },
  { path: '/activity-logs', label: 'Activity Logs', icon: History },
  { path: '/profile', label: 'Settings', icon: Settings },
  { path: '/xrays', label: 'Research X-rays', icon: Image },
];

const PATIENT_ITEMS = [
  { path: '/patient-home', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/doctors', label: 'Doctors', icon: Stethoscope },
  { path: '/appointments', label: 'Appointments', icon: CalendarDays },
  { path: '/messages', label: 'Messages', icon: MessageSquare },
  { path: '/patient-medical-reports', label: 'Medical Reports', icon: FileBarChart2 },
  { path: '/patient-history', label: 'Report History', icon: History },
  { path: '/notifications', label: 'Alerts', icon: Bell },
  { path: '/profile', label: 'Settings', icon: UserRound },
];

export default function Sidebar({ isOpen, onClose, unreadCount = 0, user, featureManagementAllowed = false }) {
  const isPatient = user?.role?.toLowerCase() === 'patient';
  const items = isPatient ? PATIENT_ITEMS : WORKSPACE_ITEMS.filter(item => item.path !== '/feature-management' || featureManagementAllowed);

  return <nav aria-label="Main navigation" className="sticky top-16 z-20 border-b border-slate-200 bg-white">
    <div className={`mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-3 py-2 sm:px-5 ${isOpen ? 'flex-wrap' : ''}`}>
      {items.map(item => {
        const Icon = item.icon;
        return <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          onClick={onClose}
          className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${isActive ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          <Icon size={15}/>
          <span>{item.label}</span>
          {item.path === '/notifications' && unreadCount > 0 && <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">{unreadCount}</span>}
        </NavLink>;
      })}
    </div>
  </nav>;
}
