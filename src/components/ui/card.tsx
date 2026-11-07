import React from 'react';
import { cn } from '../../lib/utils/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  large?: boolean;
  inset?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, hover = false, large = false, inset = false, ...props }) => {
  return (
    <div
      className={cn(
        'rounded-3xl transition-all duration-200 overflow-hidden',
        inset ? 'neu-inset' : large ? 'neu-raised-lg' : 'neu-raised',
        hover && 'hover:shadow-[-10px_-10px_20px_#FFFFFF,10px_10px_20px_#BDC8C1]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={cn('p-5 sm:p-6 flex items-center justify-between', className)} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => (
  <h3 className={cn('text-base sm:text-lg font-extrabold text-[#1F2E25] tracking-tight', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...props }) => (
  <p className={cn('text-xs sm:text-sm text-[#5B6D62] mt-0.5', className)} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={cn('p-5 sm:p-6 pt-0', className)} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={cn('p-4 sm:p-5 flex items-center justify-between', className)} {...props}>
    {children}
  </div>
);
