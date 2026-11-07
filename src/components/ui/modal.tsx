import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'lg',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop with soft blur */}
      <div
        className="fixed inset-0 bg-[#16271D]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      {/* Modal Dialog with 3D Neumorphism */}
      <div
        className={cn(
          'relative w-full bg-[#EAF0EC] rounded-3xl neu-raised-lg overflow-hidden z-10 my-8 max-h-[90vh] flex flex-col transform transition-all border-none',
          maxWidths[maxWidth]
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#C8D3CC]/40">
          <div>
            <h3 className="text-lg font-black text-[#1D3225] font-serif-display">{title}</h3>
            {description && <p className="text-xs text-[#526C5D] mt-0.5 font-medium">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#3D5B4A] hover:text-[#192C21] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Content */}
        <div className="p-6 overflow-y-auto text-[#23352B]">{children}</div>
      </div>
    </div>
  );
};
