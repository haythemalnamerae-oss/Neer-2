import React from 'react';
import { cn } from '../../lib/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  prefixIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, prefixIcon, id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    return (
      <div className="w-full space-y-1.5 text-right">
        {label && (
          <label htmlFor={inputId} className="block text-xs sm:text-sm font-bold text-[#1A2F22]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixIcon && (
            <div className="absolute right-3.5 text-[#4D6D5B] pointer-events-none flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
              {prefixIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full neu-inset text-xs sm:text-sm text-[#14291D] placeholder:text-[#678272] rounded-2xl px-4 py-3 min-h-[46px] transition-all duration-200 border-none outline-none font-medium',
              prefixIcon ? 'pr-11' : '',
              error ? 'ring-2 ring-[#A8493F]/50 text-[#8F342B]' : 'focus:ring-2 focus:ring-[#376248]/30',
              className
            )}
            {...props}
          />
        </div>
        {hint && !error && <p className="text-xs text-[#527060] font-medium">{hint}</p>}
        {error && <p className="text-xs text-[#9E392E] font-bold">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
