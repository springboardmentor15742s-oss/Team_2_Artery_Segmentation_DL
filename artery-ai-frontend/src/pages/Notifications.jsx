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
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearNotifications
} from '../services/api';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | 'issues'

  const fetchNotifs = async () => {
    try {
      setLoading(true);
      const data = await getNotifications();
      setNotifications(data || []);
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
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

      {/* Filter Tabs */}
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
