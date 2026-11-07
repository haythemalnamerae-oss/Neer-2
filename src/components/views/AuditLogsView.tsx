import React, { useState } from 'react';
import {
  History,
  Search,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { Badge } from '../ui/badge';

export const AuditLogsView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const auditLogs = dataStore.getAuditLogs();

  const filteredLogs = auditLogs.filter((log) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        log.userName.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Banner */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[#355E46] font-bold text-xs uppercase mb-1">
            <History className="w-5 h-5 stroke-[2.2]" />
            <span>سجل النشاط والتدقيق الأمني (Audit Logs)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">
            سجل العمليات والرقابة الأمنية
          </h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            تتبع غير قابل للتعديل لكافة الإجراءات والاعتمادات المالية والتشغيلية المنجزة بالنظام
          </p>
        </div>

        <Badge variant="purple" size="md">
          {auditLogs.length} عملية مسجلة
        </Badge>
      </div>

      {/* Search Input Container */}
      <div className="neu-raised rounded-3xl p-5 sm:p-6">
        <div className="relative flex items-center">
          <Search className="w-5 h-5 absolute right-3.5 text-[#547362] stroke-[2.2] pointer-events-none" />
          <input
            type="text"
            placeholder="البحث في العمليات، اسم المستخدم، التفاصيل..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-11 pl-4 text-xs sm:text-sm"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="neu-raised-lg rounded-3xl p-5 sm:p-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm">
            <thead className="text-[#4E6C5C] font-bold border-b border-[#C8D3CC]/50">
              <tr>
                <th className="p-4">التوقيت والتاريخ</th>
                <th className="p-4">المستخدم</th>
                <th className="p-4">نوع العملية</th>
                <th className="p-4">البيان والتفاصيل</th>
                <th className="p-4">الوحدة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8D3CC]/30">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:neu-inset transition">
                  <td className="p-4 font-mono text-[#527060] text-xs sm:text-sm">{log.timestamp}</td>
                  <td className="p-4 font-bold text-[#142B1D]">{log.userName}</td>
                  <td className="p-4">
                    <span className="font-bold text-[#204E34] neu-inset-sm px-2.5 py-1 rounded-full text-xs">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4 text-[#355141] max-w-md font-medium">{log.details || '-'}</td>
                  <td className="p-4">
                    <span className="text-xs text-[#5D7A6A] font-mono uppercase font-bold neu-raised-sm px-2 py-0.5 rounded-md">
                      {log.entity}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-sm text-[#547363]">
                    لا توجد سجلات مطابقة للبحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
