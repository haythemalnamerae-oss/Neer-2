import React, { useState } from 'react';
import { FileCode, Copy, Check, Search, Download, Layers, Shield, DollarSign, Database, FileText } from 'lucide-react';
import { OPS_SOURCE_REGISTRY, SourceFile } from './sourceRegistry';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface CodeRepositoryViewerProps {
  onBackToDashboard?: () => void;
}

export const CodeRepositoryViewer: React.FC<CodeRepositoryViewerProps> = ({ onBackToDashboard }) => {
  const [selectedFile, setSelectedFile] = useState<SourceFile>(OPS_SOURCE_REGISTRY[0]);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredFiles = OPS_SOURCE_REGISTRY.filter((file) => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || file.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([selectedFile.code], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = selectedFile.name;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadAll = () => {
    OPS_SOURCE_REGISTRY.forEach((file) => {
      const element = document.createElement('a');
      const blob = new Blob([file.code], { type: 'text/plain;charset=utf-8' });
      element.href = URL.createObjectURL(blob);
      element.download = file.name;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'services': return <Layers className="w-4 h-4 text-blue-500" />;
      case 'finance': return <DollarSign className="w-4 h-4 text-emerald-500" />;
      case 'admin': return <Shield className="w-4 h-4 text-purple-500" />;
      case 'database': return <Database className="w-4 h-4 text-amber-500" />;
      default: return <FileText className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs tracking-wider uppercase mb-2">
            <FileCode className="w-4 h-4" />
            <span>مستودع الأكواد البرمجية والمخططات</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            تحميل واستعراض كافة أكواد وصفحات النظام
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            يمكنك تصفح وتحميل ونسخ كافة الخدمات البرمجية (Services)، ومخطط قاعدة بيانات PostgreSQL / Supabase بالكامل مع القيود و RLS، وبيانات التهيئة والـ RBAC.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="md"
            onClick={handleDownloadAll}
            icon={<Download className="w-4 h-4 text-emerald-400" />}
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold"
          >
            تحميل كل الأكواد
          </Button>
          {onBackToDashboard && (
            <Button
              variant="secondary"
              size="md"
              onClick={onBackToDashboard}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold"
            >
              الرئيسية &larr;
            </Button>
          )}
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Sidebar: Files Browser */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-slate-200 shadow-xs">
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="البحث في الملفات والأكواد..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
              </div>
              {/* Category Pills */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'الكل' },
                  { id: 'database', label: 'قاعدة البيانات' },
                  { id: 'services', label: 'الخدمات' },
                  { id: 'finance', label: 'المالية' },
                  { id: 'admin', label: 'الصلاحيات' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      activeCategory === cat.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* File List */}
            <div className="max-h-[550px] overflow-y-auto divide-y divide-slate-100">
              {filteredFiles.map((file) => {
                const isSelected = selectedFile.path === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-right p-3.5 transition flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 border-r-4 border-indigo-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{getCategoryIcon(file.category)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-mono font-bold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                          {file.name}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                          {file.code.split('\n').length} أسطر
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{file.description}</p>
                      <span className="text-[10px] text-slate-400 font-mono block mt-1 dir-ltr text-left">
                        {file.path}
                      </span>
                    </div>
                  </button>
                );
              })}
              {filteredFiles.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs">
                  لا توجد ملفات مطابقة للبحث
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right: Code Preview Container */}
        <div className="lg:col-span-8">
          <Card className="border-slate-800 bg-slate-950 text-slate-100 shadow-xl overflow-hidden">
            {/* Code Header Bar */}
            <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-xs font-mono text-slate-300 font-medium dir-ltr">
                  {selectedFile.path}
                </span>
                <Badge variant="purple" size="sm" className="hidden sm:inline-flex text-[10px]">
                  {selectedFile.category}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="text-slate-300 hover:text-white hover:bg-slate-800 text-xs"
                  icon={<Download className="w-3.5 h-3.5" />}
                >
                  تحميل الملف
                </Button>
                <Button
                  variant={copied ? 'success' : 'primary'}
                  size="sm"
                  onClick={handleCopy}
                  className="text-xs font-bold"
                  icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                >
                  {copied ? 'تم النسخ بنجاح!' : 'نسخ الكود'}
                </Button>
              </div>
            </div>

            {/* Description Sub-bar */}
            <div className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
              <span>{selectedFile.description}</span>
              <span className="font-mono text-[11px] text-slate-500">{selectedFile.code.length} bytes</span>
            </div>

            {/* Code Body */}
            <div className="p-4 sm:p-5 overflow-x-auto max-h-[620px] font-mono text-xs sm:text-[13px] leading-relaxed dir-ltr text-left selection:bg-indigo-700 selection:text-white">
              <pre className="text-emerald-400 whitespace-pre">
                <code>{selectedFile.code}</code>
              </pre>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
