import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Flag, Globe2, LayoutDashboard, Settings2 } from 'lucide-react';
import { getFeatureEnvironments } from '../services/api';

const links = [
  { to: '/feature-management', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/feature-management/flags', label: 'Feature Flags', icon: Flag },
  { to: '/feature-management/environments', label: 'Environments', icon: Globe2 },
  { to: '/feature-management/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/feature-management/settings', label: 'Settings', icon: Settings2 },
];

export default function FeatureManagementLayout() {
  const [environments, setEnvironments] = useState([]);
  const [environmentId, setEnvironmentId] = useState(() => localStorage.getItem('artery_feature_environment') || 'development');
  const [environmentError, setEnvironmentError] = useState('');
  const location = useLocation();

  const refreshEnvironments = async () => {
    try {
      const data = await getFeatureEnvironments();
      setEnvironments(data);
      if (data.length && !data.some(item => item.id === environmentId)) {
        setEnvironmentId(data[0].id);
      }
      setEnvironmentError('');
    } catch (error) {
      setEnvironmentError(error.message || 'Feature management access is unavailable.');
    }
  };

  useEffect(() => { refreshEnvironments(); }, []);
  useEffect(() => { localStorage.setItem('artery_feature_environment', environmentId); }, [environmentId]);

  const title = links.find(item => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.label || 'Feature details';
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-white shadow-sm sm:px-6">
      <div>
        <Link to="/feature-management" className="text-[10px] font-semibold uppercase tracking-[.18em] text-sky-300">FeatureOps · Artery Medical</Link>
        <h1 className="mt-1 text-xl font-bold">{title}</h1>
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs">
        <span className="text-slate-300">Environment</span>
        <select aria-label="Feature environment" value={environmentId} onChange={event => setEnvironmentId(event.target.value)} className="max-w-40 bg-transparent font-semibold text-white outline-none [&>option]:text-slate-900">
          {environments.map(environment => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
          {!environments.length && <option value="development">Development</option>}
        </select>
      </label>
    </header>

    {environmentError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{environmentError}</p>}

    <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
      <nav aria-label="Feature management navigation" className="h-fit rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {links.map(item => {
          const Icon = item.icon;
          return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-sky-50 text-sky-800' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Icon size={16}/>{item.label}
          </NavLink>;
        })}
      </nav>
      <div className="min-w-0"><Outlet context={{ environmentId, environments, refreshEnvironments }}/></div>
    </div>
  </div>;
}
