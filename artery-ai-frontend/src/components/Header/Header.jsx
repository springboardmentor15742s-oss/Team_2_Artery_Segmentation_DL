import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Bell, User as UserIcon, LogOut, CheckCircle } from 'lucide-react';
import { NotificationBadge } from '../Notification/NotificationBadge';
import { logout } from '../../services/api';

export default function Header({
  onMenuToggle,
  title = 'Dashboard',
  user,
  unreadCount = 0,
}) {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getInitials = (name) => {
    if (!name) return 'MD';
    return name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">
            {title}
          </h2>
        </div>
      </div>

      {/* Right: Notifications, Quick Actions, Profile Dropdown */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Notification Bell */}
        <Link
          to="/notifications"
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          <NotificationBadge count={unreadCount} />
        </Link>

        {/* User Profile Pill / Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none"
            aria-expanded={profileDropdownOpen}
          >
            <div className="w-8 h-8 rounded-full bg-medical-600 text-white flex items-center justify-center font-semibold text-xs shadow-2xs">
              {getInitials(user?.name)}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-800 leading-tight">
                {user?.name || 'Dr. Sarah Mitchell'}
              </div>
              <div className="text-[11px] text-slate-500 font-medium leading-tight">
                {user?.role || 'Radiologist / Clinician'}
              </div>
            </div>
          </button>

          {profileDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-50 text-sm">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900">{user?.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                </div>

                <Link
                  to="/profile"
                  onClick={() => setProfileDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  Clinical Profile
                </Link>

                <div className="border-t border-slate-100 my-1"></div>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
