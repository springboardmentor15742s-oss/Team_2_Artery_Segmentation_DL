import React from 'react';
import LoadingSpinner from '../Loading/LoadingSpinner';

export default function Table({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No records found.',
  emptyAction = null,
  keyField = 'id',
  onRowClick,
}) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
            {columns.map((col, idx) => (
              <th
                key={col.key || idx}
                scope="col"
                className={`py-3 px-4 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-slate-500">
                <div className="flex flex-col items-center justify-center gap-2">
                  <LoadingSpinner size="md" />
                  <span className="text-xs text-slate-500 font-medium">Loading clinical records...</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center">
                <div className="max-w-xs mx-auto flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-700">{emptyMessage}</p>
                  {emptyAction && <div className="mt-3">{emptyAction}</div>}
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const rowKey = row[keyField] || index;
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`transition-colors duration-100 hover:bg-slate-50/70 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {columns.map((col, cIdx) => (
                    <td
                      key={col.key || cIdx}
                      className={`py-3.5 px-4 text-slate-700 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {col.render ? col.render(row[col.key], row, index) : row[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
