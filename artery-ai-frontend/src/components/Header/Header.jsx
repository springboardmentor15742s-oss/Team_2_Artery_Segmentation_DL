import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Bell, Languages, LogOut, Menu, User as UserIcon } from 'lucide-react';
import { getApiHealth, logout } from '../../services/api';
import { LANGUAGES, useLanguage } from '../../context/LanguageContext';

export default function Header({
  onMenuToggle,
  title = 'Dashboard',
  user,
  unreadCount = 0,
}) {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();

  useEffect(() => {
    let active = true;
    const checkApi = async () => {
      try {
        await getApiHealth();
        if (active) setApiStatus('connected');
      } catch {
        if (active) setApiStatus('offline');
      }
    };
    checkApi();
    const timer = window.setInterval(checkApi, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/90 bg-white/95 px-3 backdrop-blur-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-700 to-cyan-400 text-white shadow-sm"><Activity size={19}/></div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">ArteryVision</h1>
            <p className="hidden truncate text-[10px] text-slate-500 sm:block">Coronary Imaging Workspace · {title}</p>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold sm:inline-flex ${apiStatus === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : apiStatus === 'offline' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`} title="Live backend health check">
          <i className={`h-1.5 w-1.5 rounded-full ${apiStatus === 'connected' ? 'bg-emerald-500' : apiStatus === 'offline' ? 'bg-rose-500' : 'bg-slate-400'}`}/>
          API {apiStatus === 'connected' ? 'connected' : apiStatus === 'offline' ? 'offline' : 'checking'}
        </span>
        <Link to="/notifications" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title={`${unreadCount} unread alerts`}>
          <Bell size={19}/>
          {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[9px] font-bold leading-4 text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </Link>
        <label className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-600 sm:flex" title="Select language"><Languages size={15}/><select aria-label="Language" value={language} onChange={e => setLanguage(e.target.value)} className="max-w-24 bg-transparent text-xs font-semibold outline-none">{LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>

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
