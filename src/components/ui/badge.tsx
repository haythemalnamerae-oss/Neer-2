import React from 'react';
import { cn } from '../../lib/utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md';
  inset?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'default',
  size = 'md',
  inset = true,
  ...props
}) => {
  const base = cn(
    'inline-flex items-center font-bold rounded-full whitespace-nowrap leading-none border-none transition-all',
    inset ? 'neu-inset-sm' : 'neu-raised-sm'
  );

  const variants = {
    default: 'text-[#3E5547]',
    success: 'text-[#2D5A3C]',
    warning: 'text-[#8A5B20]',
    danger: 'text-[#A03E33]',
    info: 'text-[#285A75]',
    purple: 'text-[#633B77]',
  };

  const sizes = {
    sm: 'text-[11px] px-2.5 py-1',
    md: 'text-xs px-3 py-1.5',
  };

  return (
    <span className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </span>
  );
};
