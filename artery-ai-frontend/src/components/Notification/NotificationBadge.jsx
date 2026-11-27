import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export function NotificationIcon({ type, className = 'w-5 h-5' }) {
  switch (type) {
    case 'processing_completed':
      return <CheckCircle2 className={`${className} text-emerald-500`} />;
    case 'processing_failed':
      return <AlertCircle className={`${className} text-rose-500`} />;
    case 'low_confidence':
    case 'quality_issue':
      return <AlertTriangle className={`${className} text-amber-500`} />;
    case 'system_info':
    default:
      return <Info className={`${className} text-sky-500`} />;
  }
}

export function NotificationBadge({ count }) {
  if (!count || count <= 0) return null;

  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs">
      {count > 9 ? '9+' : count}
    </span>
  );
}

export default function NotificationItem({ notification, onMarkAsRead }) {
  const { id, type, title, message, timestamp, read, caseId, patientId } = notification;

  return (
    <div
      onClick={() => onMarkAsRead && onMarkAsRead(id)}
      className={`p-4 rounded-xl border transition-all duration-150 flex gap-3.5 items-start cursor-pointer ${
        read
          ? 'bg-white border-slate-200/80 hover:bg-slate-50/80 text-slate-600'
          : 'bg-medical-50/50 border-medical-200 hover:bg-medical-50 text-slate-800 shadow-2xs'
      }`}
    >
      <div className="shrink-0 mt-0.5">
        <NotificationIcon type={type} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className={`text-sm font-semibold ${read ? 'text-slate-700' : 'text-slate-900'}`}>
            {title}
          </h4>
          <span className="text-[11px] text-slate-400 shrink-0">{timestamp}</span>
        </div>

        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{message}</p>

        {(caseId || patientId) && (
          <div className="mt-2 flex items-center gap-2">
            {caseId && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 text-slate-700">
                {caseId}
              </span>
            )}
            {patientId && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono text-slate-500">
                Patient: {patientId}
              </span>
            )}
            {!read && (
              <span className="text-[11px] font-medium text-medical-600 ml-auto">
                Mark as read
              </span>
            )}
          </div>
        )}
      </div>

      {!read && (
        <span className="w-2 h-2 rounded-full bg-medical-500 shrink-0 mt-2" title="Unread" />
      )}
    </div>
  );
}
