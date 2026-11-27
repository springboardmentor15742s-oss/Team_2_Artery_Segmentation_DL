import React, { forwardRef } from 'react';

const Select = forwardRef(function Select(
  {
    label,
    options = [],
    error,
    helperText,
    id,
    placeholder = 'Select an option',
    className = '',
    required = false,
    disabled = false,
    value,
    onChange,
    ...props
  },
  ref
) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
          {required && <span className="text-rose-500 ml-1" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative rounded-lg shadow-sm">
        <select
          ref={ref}
          id={selectId}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={`block w-full appearance-none rounded-lg border text-sm py-2.5 pl-3.5 pr-10 bg-white transition-colors duration-150
            ${error
              ? 'border-rose-400 text-rose-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
              : 'border-slate-300 text-slate-900 focus:border-medical-500 focus:ring-1 focus:ring-medical-500'
            }
            ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}
            ${className}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => {
            const isObj = typeof opt === 'object' && opt !== null;
            const optVal = isObj ? opt.value : opt;
            const optLabel = isObj ? opt.label : opt;
            return (
              <option key={optVal} value={optVal}>
                {optLabel}
              </option>
            );
          })}
        </select>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {error ? (
        <p id={`${selectId}-error`} className="mt-1.5 text-xs text-rose-600 font-medium">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${selectId}-helper`} className="mt-1.5 text-xs text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

export default Select;
