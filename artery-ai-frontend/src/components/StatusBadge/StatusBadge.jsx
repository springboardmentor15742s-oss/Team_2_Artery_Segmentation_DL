import React from 'react';

export default function StatusBadge({ status, size = 'sm', className = '' }) {
  if (!status) return null;

  const normalized = status.toLowerCase();

  let styles = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  if (normalized.includes('completed') || normalized.includes('finalized') || normalized.includes('ready')) {
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    dotColor = 'bg-emerald-500';
  } else if (normalized.includes('in progress') || normalized.includes('preparation') || normalized.includes('processing')) {
    styles = 'bg-sky-50 text-sky-700 border-sky-200';
    dotColor = 'bg-sky-500 animate-pulse';
  } else if (normalized.includes('pending')) {
    styles = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
  } else if (normalized.includes('review') || normalized.includes('flag')) {
    styles = 'bg-purple-50 text-purple-700 border-purple-200';
    dotColor = 'bg-purple-500';
  } else if (normalized.includes('fail') || normalized.includes('corrupt') || normalized.includes('error')) {
    styles = 'bg-rose-50 text-rose-700 border-rose-200';
    dotColor = 'bg-rose-500';
  } else if (normalized.includes('draft')) {
    styles = 'bg-slate-100 text-slate-600 border-slate-300';
    dotColor = 'bg-slate-400';
  }

  const sizeStyles = {
    xs: 'text-[11px] px-2 py-0.5 gap-1',
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3 py-1.5 gap-2',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shadow-2xs ${styles} ${sizeStyles[size]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{status}</span>
    </span>
  );
}
