import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X, Plus } from 'lucide-react';

export interface SmartSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface SmartSelectProps {
  label?: string;
  placeholder?: string;
  options: (SmartSelectOption | string)[];
  value: string | string[];
  onChange: (value: any) => void;
  isMulti?: boolean;
  creatable?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onCreateOption?: (newVal: string) => void;
  helperText?: string;
}

export const SmartSelect: React.FC<SmartSelectProps> = ({
  label,
  placeholder = 'ابحث أو اختر...',
  options,
  value,
  onChange,
  isMulti = false,
  creatable = true,
  required = false,
  disabled = false,
  className = '',
  onCreateOption,
  helperText,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Normalize options to SmartSelectOption format
  const normalizedOptions: SmartSelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  // Selected values array
  const selectedValues: string[] = isMulti
    ? Array.isArray(value)
      ? value
      : value
      ? [value]
      : []
    : typeof value === 'string' && value
    ? [value]
    : [];

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on query
  const filteredOptions = normalizedOptions.filter((opt) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      opt.label.toLowerCase().includes(q) ||
      (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
      opt.value.toLowerCase().includes(q)
    );
  });

  const queryTrimmed = searchQuery.trim();
  const exactMatch = normalizedOptions.some(
    (opt) => opt.label.trim().toLowerCase() === queryTrimmed.toLowerCase()
  );
  const canCreate = creatable && queryTrimmed.length > 0 && !exactMatch;

  const handleSelectOption = (optValue: string) => {
    if (isMulti) {
      if (selectedValues.includes(optValue)) {
        onChange(selectedValues.filter((v) => v !== optValue));
      } else {
        onChange([...selectedValues, optValue]);
      }
      setSearchQuery('');
    } else {
      onChange(optValue);
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const handleCreateNew = () => {
    if (!canCreate) return;
    const newVal = queryTrimmed;
    if (onCreateOption) {
      onCreateOption(newVal);
    }
    if (isMulti) {
      if (!selectedValues.includes(newVal)) {
        onChange([...selectedValues, newVal]);
      }
    } else {
      onChange(newVal);
      setIsOpen(false);
    }
    setSearchQuery('');
  };

  const handleRemoveItem = (valToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMulti) {
      onChange(selectedValues.filter((v) => v !== valToRemove));
    } else {
      onChange('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        handleSelectOption(filteredOptions[0].value);
      } else if (canCreate) {
        handleCreateNew();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Find labels for selected chips
  const getLabelForValue = (val: string) => {
    const found = normalizedOptions.find((opt) => opt.value === val);
    return found ? found.label : val;
  };

  return (
    <div className={`space-y-1.5 relative ${className}`} ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700">
            {label} {required && <span className="text-rose-600">*</span>}
          </label>
          {isMulti && selectedValues.length > 0 && (
            <span className="text-[11px] font-extrabold text-emerald-800">
              تم اختيار {selectedValues.length}
            </span>
          )}
        </div>
      )}

      {/* Main Trigger Box */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`w-full neu-inset px-3.5 py-2 min-h-[46px] rounded-2xl cursor-pointer flex items-center justify-between gap-2 flex-wrap transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-black/10'
        } ${isOpen ? 'ring-2 ring-emerald-700/30' : ''}`}
      >
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {/* Multi-select selected items as chips */}
          {isMulti && selectedValues.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap py-0.5">
              {selectedValues.map((val) => (
                <span
                  key={val}
                  className="neu-raised text-[11px] font-extrabold text-[#193223] px-2.5 py-1 rounded-xl flex items-center gap-1.5 animate-in zoom-in-95 duration-100"
                >
                  <span>{getLabelForValue(val)}</span>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveItem(val, e)}
                    className="hover:text-rose-600 rounded-full cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3 stroke-[2.5]" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Single select value display when closed */}
          {!isMulti && selectedValues.length > 0 && !isOpen && (
            <span className="text-xs sm:text-sm font-extrabold text-slate-800 truncate">
              {getLabelForValue(selectedValues[0])}
            </span>
          )}

          {/* Search Input field */}
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedValues.length === 0
                ? placeholder
                : isMulti
                ? 'ابحث أو أضف المزيد...'
                : getLabelForValue(selectedValues[0])
            }
            disabled={disabled}
            className="flex-1 min-w-[120px] bg-transparent text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden py-1"
          />
        </div>

        {/* Clear & Arrow Icons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedValues.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(isMulti ? [] : '');
                setSearchQuery('');
              }}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              title="مسح التحديد"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-800' : ''
            }`}
          />
        </div>
      </div>

      {helperText && <p className="text-[11px] text-slate-500 pr-1">{helperText}</p>}

      {/* Dropdown Popup Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 neu-raised-lg bg-[#EAF0EC] rounded-2xl p-2 max-h-64 overflow-y-auto space-y-1 shadow-2xl border border-black/[0.04] animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Creatable Quick Add Option */}
          {canCreate && (
            <button
              type="button"
              onClick={handleCreateNew}
              className="w-full text-right p-2.5 rounded-xl text-xs font-black text-emerald-900 bg-emerald-100/70 hover:bg-emerald-200/80 transition-all flex items-center justify-between cursor-pointer border border-emerald-300"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-4 h-4 stroke-[3] text-emerald-700" />
                <span>إضافة كخيار جديد: <strong>"{queryTrimmed}"</strong></span>
              </span>
              <span className="text-[10px] neu-inset-sm px-2 py-0.5 rounded-md font-mono">
                اضغط Enter
              </span>
            </button>
          )}

          {/* Options List */}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => {
              const isSelected = selectedValues.includes(opt.value);

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectOption(opt.value)}
                  className={`w-full text-right p-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'neu-inset text-emerald-950 font-black bg-[#E2EAE4]'
                      : 'hover:neu-raised text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {opt.icon && <span className="text-sm shrink-0">{opt.icon}</span>}
                    <div className="truncate">
                      <span className="block truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="block text-[10px] text-slate-500 truncate font-normal">
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {opt.badge && (
                      <span className="text-[10px] neu-inset-sm px-2 py-0.5 rounded-md text-slate-600 font-bold">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <div className="w-5 h-5 rounded-md bg-emerald-800 text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          ) : !canCreate ? (
            <div className="p-4 text-center text-xs text-slate-500 neu-inset-sm rounded-xl">
              لا توجد نتائج مطابقة لـ "{searchQuery}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
