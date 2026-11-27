import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  Trash2,
  Filter,
  CheckCheck,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import NotificationItem from '../components/Notification/NotificationBadge';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import {
  getNotifications,
  getEmailAlertStatus,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearNotifications
} from '../services/api';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | 'issues'
  const [emailStatus, setEmailStatus] = useState(null);

  const fetchNotifs = async () => {
    try {
      setLoading(true);
      const data = await getNotifications();
      setNotifications(data || []);
      setLoadError('');
    } catch (err) {
      console.error('Failed to load notifications', err);
      setLoadError(err.message || 'Could not load notifications. Check that you are signed in and the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
    getEmailAlertStatus().then(setEmailStatus).catch(() => setEmailStatus(null));
  }, []);

  const handleMarkAsRead = async (id) => {
    const updated = await markNotificationAsRead(id);
    setNotifications(updated);
  };

  const handleMarkAllRead = async () => {
    const updated = await markAllNotificationsAsRead();
    setNotifications(updated);
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all clinical notifications?')) {
      const updated = await clearNotifications();
      setNotifications(updated);
    }
  };

  const filteredNotifs = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter === 'issues') {
      return n.type === 'processing_failed' || n.type === 'quality_issue' || n.type === 'low_confidence';
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Clinical Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-medical-100 text-medical-800">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time pipeline ingestion updates, quality assurance alerts, and processing events
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              icon={CheckCheck}
              onClick={handleMarkAllRead}
            >
              Mark All as Read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={handleClearAll}
              className="text-slate-500 hover:text-rose-600"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {notifications.some(notification => ['case_uploaded','upload_completed','report_approved','analysis_completed'].includes(notification.type)) && <section className="grid gap-3 sm:grid-cols-2">
        {notifications.filter(notification => ['case_uploaded','upload_completed','report_approved','analysis_completed'].includes(notification.type)).slice(0,6).map(notification => {
          const published = notification.type === 'report_approved';
          const uploaded = ['case_uploaded','upload_completed'].includes(notification.type);
          const label = published ? 'Patient report published' : uploaded ? 'New scan/case' : 'Report awaiting clinical review';
          const target = notification.caseId ? (uploaded ? `/cases/${encodeURIComponent(notification.caseId)}` : `/viewer/${encodeURIComponent(notification.caseId)}`) : '/reports';
          return <article key={notification.id} className={`rounded-xl border p-4 ${published ? 'border-emerald-200 bg-emerald-50' : uploaded ? 'border-sky-200 bg-sky-50' : 'border-amber-200 bg-amber-50'}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{label}</p>
            <h2 className="mt-1 text-sm font-bold text-slate-900">{notification.title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">{notification.message}</p>
            <a href={target} className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50">{published ? 'Review published report' : uploaded ? 'Open case for review' : 'Review report'}</a>
          </article>;
        })}
      </section>}
      {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError}</div>}
      {emailStatus && <div className={`rounded-lg border px-4 py-3 text-xs ${emailStatus.configured ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}><strong>Email alerts {emailStatus.configured ? 'configured' : 'not configured'}.</strong> {emailStatus.message} Appointment and report alerts still appear in this portal.</div>}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            filter === 'unread'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Unread ({unreadCount})
        </button>
        <button
          onClick={() => setFilter('issues')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            filter === 'issues'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Quality & Pipeline Alerts
        </button>
      </div>

      {/* Notification List Container */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center">
            <LoadingSpinner size="md" label="Loading notifications..." />
          </div>
        ) : filteredNotifs.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Bell className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800">
              No notifications to display
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              {filter === 'unread'
                ? 'All alerts have been reviewed.'
                : 'Pipeline is quiet. Upload scans or trigger case processing to receive updates.'}
            </p>
          </div>
        ) : (
          filteredNotifs.map((notif) => (
            <NotificationItem
              key={notif.id}
              notification={notif}
              onMarkAsRead={handleMarkAsRead}
            />
          ))
        )}
      </div>
    </div>
  );
}
