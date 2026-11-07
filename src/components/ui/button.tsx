import React from 'react';
import { cn } from '../../lib/utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-bold rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none gap-2.5 cursor-pointer select-none border-none tracking-wide';

  const variants = {
    primary: 'neu-button text-[#1A2E22] hover:text-[#0C1A12] active:neu-inset',
    secondary: 'neu-raised-sm text-[#2E4738] hover:text-[#1A2E22] active:neu-inset',
    outline: 'neu-raised-sm text-[#3E5C4A] hover:text-[#1A2E22] active:neu-inset',
    danger: 'neu-button text-[#94382D] hover:text-[#73251B] active:neu-inset',
    success: 'neu-button text-[#1F5434] hover:text-[#123821] active:neu-inset',
    ghost: 'text-[#446251] hover:neu-inset-sm active:neu-inset',
  };

  const sizes = {
    sm: 'text-xs sm:text-xs min-h-[38px] px-4 py-2',
    md: 'text-sm min-h-[44px] px-5 py-2.5',
    lg: 'text-sm sm:text-base min-h-[50px] px-6 py-3',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {icon && (
        <span className="shrink-0 flex items-center justify-center [&>svg]:w-4.5 [&>svg]:h-4.5 sm:[&>svg]:w-4 sm:[&>svg]:h-4">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
};
