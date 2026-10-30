import React, { forwardRef } from 'react';

const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    id,
    type = 'text',
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    onRightIconClick,
    className = '',
    required = false,
    disabled = false,
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
          {required && <span className="text-rose-500 ml-1" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative rounded-lg shadow-sm">
        {LeftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <LeftIcon className="w-4 h-4" />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={disabled}
          required={required}
          className={`block w-full rounded-lg border text-sm transition-colors duration-150
            ${LeftIcon ? 'pl-9' : 'pl-3.5'}
            ${RightIcon ? 'pr-10' : 'pr-3.5'}
            py-2.5 bg-white placeholder-slate-400
            ${error
              ? 'border-rose-400 text-rose-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
              : 'border-slate-300 text-slate-900 focus:border-medical-500 focus:ring-1 focus:ring-medical-500'
            }
            ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}
            ${className}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />

        {RightIcon && (
          <div
            onClick={onRightIconClick}
            className={`absolute inset-y-0 right-0 pr-3 flex items-center ${
              onRightIconClick ? 'cursor-pointer text-slate-500 hover:text-slate-700' : 'pointer-events-none text-slate-400'
            }`}
          >
            <RightIcon className="w-4 h-4" />
          </div>
        )}
      </div>

      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-rose-600 font-medium">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="mt-1.5 text-xs text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
