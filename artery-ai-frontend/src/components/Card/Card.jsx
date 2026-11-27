import React from 'react';

export default function Card({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  footer,
  className = '',
  bodyClassName = '',
  noPadding = false,
  ...props
}) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden ${className}`}
      {...props}
    >
      {(title || subtitle || action || Icon) && (
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="w-8 h-8 rounded-lg bg-medical-50 text-medical-600 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div>
              {title && <h3 className="text-base font-semibold text-slate-800">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className={`${noPadding ? '' : 'p-5'} ${bodyClassName}`}>
        {children}
      </div>

      {footer && (
        <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 text-xs text-slate-600">
          {footer}
        </div>
      )}
    </div>
  );
}
