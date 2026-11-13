// Source: Google Maps Platform Code Assist
import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Clock,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Navigation,
  Compass,
  Filter,
  Search,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { Task, TaskStatus } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { refreshTaskSnapshot, updateTaskLifecycle } from '../../services/tasks.api';
import { captureRequiredLocation, ensureFieldVisitCanStart, recordFieldLifecycleEvent, recordFieldLocationFailure, startFieldLocationTracking, stopFieldLocationTracking } from '../../lib/operations/fieldEvents';
import { hasPermission } from '../../lib/rbac/permissions';
import { formatCurrency, TASK_STATUS_CONFIG } from '../../lib/utils/format';
import { Button } from '../ui/button';

import { TaskSyncStatus } from '../tasks/TaskSyncStatus';
interface FieldMapViewProps {
  onSelectTask: (task: Task) => void;
  onOpenNewTask: () => void;
  onRecordOutcome: (task: Task) => void;
}

// Coordinates are displayed only when recorded on the task or captured from the device.
export const FieldMapView: React.FC<FieldMapViewProps> = ({
  onSelectTask,
  onOpenNewTask,
  onRecordOutcome,
}) => {
  const tasks = dataStore.getTasks();
  const currentUser = dataStore.getCurrentUser();
  const users = dataStore.getUsers();
  const canViewAllTasks = hasPermission(currentUser.role, 'tasks', 'view');
  const canCreateTask = hasPermission(currentUser.role, 'tasks', 'create');
  const canEditTask = hasPermission(currentUser.role, 'tasks', 'edit');
  const visibleTasks = currentUser.role === 'field_officer'
    ? tasks.filter((task) => task.assigneeId === currentUser.id || task.assignees?.some((assignee) => assignee.appUserId === currentUser.id))
    : canViewAllTasks ? tasks : [];

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [userLiveCoords, setUserLiveCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationSuccessMsg, setLocationSuccessMsg] = useState('');

  // Map API Key retrieval
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

  // Calculate task coordinates
  const tasksWithCoords = useMemo(() => visibleTasks.filter((task) => {
    const coords = task.geoCoordinates;
    return Boolean(coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
      && coords.lat >= -90 && coords.lat <= 90 && coords.lng >= -180 && coords.lng <= 180);
  }).map((task) => ({ ...task, resolvedCoords: task.geoCoordinates! })), [visibleTasks]);

  const tasksWithoutCoords = useMemo(() => visibleTasks.filter((task) => {
    if (tasksWithCoords.some((located) => located.id === task.id)) return false;
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (assigneeFilter !== 'all' && task.assigneeId !== assigneeFilter) return false;
    if (typeFilter !== 'all' && task.taskTypeCategory !== typeFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    return !query || [task.title, task.location, task.code || '', task.assigneeName]
      .some((value) => value.toLowerCase().includes(query));
  }), [visibleTasks, tasksWithCoords, statusFilter, assigneeFilter, typeFilter, searchQuery]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasksWithCoords.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (assigneeFilter !== 'all' && task.assigneeId !== assigneeFilter) return false;
      if (typeFilter !== 'all' && task.taskTypeCategory !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          task.title.toLowerCase().includes(q) ||
          task.location.toLowerCase().includes(q) ||
          (task.code && task.code.toLowerCase().includes(q)) ||
          task.assigneeName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [tasksWithCoords, statusFilter, assigneeFilter, typeFilter, searchQuery]);

  // Handle capture GPS location
  const handleCaptureCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('خدمة تحديد الموقع الجغرافي (GPS) غير مدعومة في متصفحك.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        setUserLiveCoords(coords);
        setLocationSuccessMsg(
          `تم تحديد موقعك الميداني بدقة ±${coords.accuracy}م (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) في تمام ${new Date().toLocaleTimeString('ar-AE')}`
        );
        setTimeout(() => setLocationSuccessMsg(''), 8000);
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation capture failed:', err);
        // Fallback default coordinates
          setLocationSuccessMsg('تعذر تحديد موقعك. لم يتم تسجيل إحداثيات افتراضية.');
        setTimeout(() => setLocationSuccessMsg(''), 6000);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const getFieldEventType = (task: Task, action: 'started' | 'paused' | 'resumed') => {
    const visit = task.taskTypeCategory === 'visit';
    if (visit) return ({ started: 'visit_started', paused: 'visit_paused', resumed: 'visit_resumed' } as const)[action];
    return ({ started: 'task_started', paused: 'task_paused', resumed: 'task_resumed' } as const)[action];
  };

  const handleStartTaskWithLocation = async (task: Task) => {
    if (task.taskTypeCategory !== 'field' && task.taskTypeCategory !== 'visit') {
      try { await updateTaskLifecycle(task.id, 'start'); }
      catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر بدء المهمة.'); }
      return;
    }
    setIsLocating(true);
    try {
      await ensureFieldVisitCanStart();
      const location = await captureRequiredLocation();
      await recordFieldLifecycleEvent({
        taskId: task.id,
        eventType: getFieldEventType(task, 'started'),
        eventLabel: task.taskTypeCategory === 'visit' ? 'بدء الزيارة' : 'بدء المهمة الميدانية',
        location,
        details: { taskTitle: task.title, source: 'field_map' },
      });
      const coords = { lat: location.latitude, lng: location.longitude };
      await refreshTaskSnapshot();
      setUserLiveCoords({ ...coords, accuracy: Math.round(location.accuracyMeters) });
      startFieldLocationTracking(task.id);
      setLocationSuccessMsg('تم بدء التنفيذ وتوثيق الحدث والموقع على الخادم بنجاح.');
    } catch (error) {
      await recordFieldLocationFailure(task.id, 'تعذر بدء المهمة بسبب الموقع', error).catch(() => undefined);
      window.alert(error instanceof Error ? error.message : 'تعذر بدء المهمة دون موقع GPS موثق.');
    } finally {
      setIsLocating(false);
    }
  };

  const handlePauseTask = async (task: Task) => {
    const reason = window.prompt('يرجى كتابة سبب الإيقاف المؤقت للمهمة:', 'انتظار توريد المواد / موافقة المشرف');
    if (!reason?.trim()) return;
    if (task.taskTypeCategory !== 'field' && task.taskTypeCategory !== 'visit') {
      try { await updateTaskLifecycle(task.id, 'pause', reason.trim()); }
      catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر إيقاف المهمة.'); }
      return;
    }
    setIsLocating(true);
    try {
      const location = await captureRequiredLocation();
      await recordFieldLifecycleEvent({
        taskId: task.id,
        eventType: getFieldEventType(task, 'paused'),
        eventLabel: 'إيقاف مؤقت من الخريطة الميدانية',
        location,
        details: { reason: reason.trim(), source: 'field_map' },
      });
      await refreshTaskSnapshot();
      stopFieldLocationTracking(task.id);
    } catch (error) {
      await recordFieldLocationFailure(task.id, 'تعذر إيقاف المهمة بسبب الموقع', error).catch(() => undefined);
      window.alert(error instanceof Error ? error.message : 'تعذر توثيق الإيقاف المؤقت.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleResumeTask = async (task: Task) => {
    if (task.taskTypeCategory !== 'field' && task.taskTypeCategory !== 'visit') {
      try { await updateTaskLifecycle(task.id, 'resume'); }
      catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر استئناف المهمة.'); }
      return;
    }
    setIsLocating(true);
    try {
      await ensureFieldVisitCanStart();
      const location = await captureRequiredLocation();
      await recordFieldLifecycleEvent({
        taskId: task.id,
        eventType: getFieldEventType(task, 'resumed'),
        eventLabel: 'استئناف العمل من الخريطة الميدانية',
        location,
        details: { source: 'field_map' },
      });
      await refreshTaskSnapshot();
      startFieldLocationTracking(task.id);
    } catch (error) {
      await recordFieldLocationFailure(task.id, 'تعذر استئناف المهمة بسبب الموقع', error).catch(() => undefined);
      window.alert(error instanceof Error ? error.message : 'تعذر توثيق استئناف المهمة.');
    } finally {
      setIsLocating(false);
    }
  };

  const mapCenter = useMemo(() => {
    if (selectedTask?.geoCoordinates) return selectedTask.geoCoordinates;
    if (userLiveCoords) return { lat: userLiveCoords.lat, lng: userLiveCoords.lng };
    if (filteredTasks[0]?.resolvedCoords) return filteredTasks[0].resolvedCoords;
    return { lat: 0, lng: 0 };
  }, [selectedTask, userLiveCoords, filteredTasks]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div
        className="rounded-[28px] p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 text-white shadow-xl relative overflow-hidden"
        style={{
          backgroundColor: '#2A443B',
          boxShadow: '0 20px 45px rgba(22, 44, 34, 0.28), 0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="relative z-10 space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
            <Compass className="w-4 h-4 animate-spin-slow" />
            <span>نظام التتبع الميداني والخرائط التفاعلية (Field GIS & GPS)</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white font-serif-hero tracking-tight">
            خريطة المهام، الزيارات ومواقع التنفيذ الميداني
          </h1>
          <p className="text-xs sm:text-sm text-white/75 leading-relaxed font-sans-inter">
            رصد مواقع المهام جغرافياً، وتوثيق وقت البدء والانتهاء من الخادم وحساب مدة التنفيذ، ومتابعة الأحداث الميدانية الموثقة.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0 z-10">
          <button
            onClick={handleCaptureCurrentLocation}
            disabled={isLocating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold font-sans-inter transition-all border border-white/20 cursor-pointer shadow-xs active:scale-95 disabled:opacity-60"
          >
            <Navigation className={`w-4 h-4 text-emerald-300 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'جاري الرصد بالـ GPS...' : 'تحديد موقعي الحالي'}</span>
          </button>

          {canCreateTask && <button
            onClick={onOpenNewTask}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#F4F7F5] hover:bg-white text-[#2A443B] text-xs font-bold font-sans-inter transition-all shadow-md cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>مهمة جديدة</span>
          </button>}
        </div>
      </div>

      {/* Geolocation Success Feedback */}
      {locationSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center justify-between shadow-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{locationSuccessMsg}</span>
          </div>
          <button
            onClick={() => setLocationSuccessMsg('')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="inner-white-card p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="البحث بالاسم، الكود، الموقع الميداني، أو المسؤول..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#2A443B]"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold focus:outline-none focus:border-[#2A443B]"
          >
            <option value="all">كافة الحالات الميدانية ({visibleTasks.length})</option>
            <option value="in_progress">قيد التنفيذ النشط الآن</option>
            <option value="scheduled">مجدولة للتنفيذ</option>
            <option value="paused">متوقفة مؤقتاً</option>
            <option value="completed">مكتملة ومعتمدة</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold focus:outline-none focus:border-[#2A443B]"
          >
            <option value="all">كافة التصنيفات</option>
            <option value="field">مهام ميدانية</option>
            <option value="visit">زيارات وتفتيش</option>
            <option value="financial">مهام مالية وتحصيل</option>
            <option value="administrative">مهام إدارية</option>
          </select>

          {/* Assignee Filter */}
          {currentUser.role !== 'field_officer' && <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold focus:outline-none focus:border-[#2A443B]"
          >
            <option value="all">كافة المنفذين</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.roleTitleAr})
              </option>
            ))}
          </select>}
        </div>
      </div>

      <TaskSyncStatus />

      {/* Main Map View & Side Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Map Canvas Container */}
        <div className="lg:col-span-8 space-y-4">
          <div className="inner-white-card p-3 overflow-hidden rounded-[26px]">
            <div className="relative w-full h-[540px] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner">
              {apiKey && (filteredTasks.length > 0 || userLiveCoords) ? (
                <APIProvider apiKey={apiKey} libraries={['marker']} reuseMaps>
                  <Map
                    mapId="DEMO_MAP_ID"
                    defaultCenter={mapCenter}
                    center={mapCenter}
                    defaultZoom={11}
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '100%' }}
                  >
                    {/* Render Tasks Markers */}
                    {filteredTasks.map((task) => {
                      const isSelected = selectedTask?.id === task.id;
                      const isRunning = task.status === 'in_progress' || task.status === 'started';
                      const isPaused = task.status === 'paused';
                      const isDone = task.status === 'completed' || task.status === 'approved';

                      const pinBg = isRunning
                        ? '#059669' // Emerald
                        : isPaused
                        ? '#D97706' // Amber
                        : isDone
                        ? '#475569' // Slate
                        : '#2563EB'; // Blue

                      return (
                        <AdvancedMarker
                          key={task.id}
                          position={task.resolvedCoords}
                          title={`${task.title} - ${task.location}`}
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className="relative group cursor-pointer">
                            {isRunning && (
                              <span className="absolute -inset-2 rounded-full bg-emerald-400/40 animate-ping" />
                            )}
                            <div
                              className={`flex items-center justify-center p-2 rounded-full text-white shadow-lg transition-transform duration-200 ${
                                isSelected ? 'scale-125 ring-3 ring-white ring-offset-2 ring-offset-slate-800' : 'hover:scale-110'
                              }`}
                              style={{ backgroundColor: pinBg }}
                            >
                              <MapPin className="w-5 h-5 fill-white stroke-none" />
                            </div>

                            {/* Floating Tooltip */}
                            <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-1 hidden group-hover:block bg-[#1B3026] text-white text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap shadow-md pointer-events-none z-30">
                              {task.title}
                            </div>
                          </div>
                        </AdvancedMarker>
                      );
                    })}

                    {/* User's current location pin */}
                    {userLiveCoords && (
                      <AdvancedMarker position={userLiveCoords} title="موقعي الحالي المباشر">
                        <div className="relative flex items-center justify-center">
                          <span className="absolute w-8 h-8 rounded-full bg-blue-500/30 animate-ping" />
                          <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md z-10" />
                        </div>
                      </AdvancedMarker>
                    )}
                  </Map>
                </APIProvider>
              ) : (
                /* No API key: present real geolocated tasks without simulated map pins */
                <div className="relative w-full h-full bg-[#EAF0EC] p-6 flex flex-col justify-between overflow-hidden">
                  {/* Subtle Map Grid Lines */}
                  <div
                    className="absolute inset-0 opacity-25 pointer-events-none"
                    style={{
                      backgroundImage: 'radial-gradient(#2A443B 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                    }}
                  />

                  {/* Top Map Mode Indicator */}
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-200 text-xs font-bold text-slate-800 shadow-xs">
                      <Compass className="w-4 h-4 text-emerald-600" />
                      <span>عرض مواقع المهام المسجلة</span>
                      <span className="text-[10px] font-semibold text-slate-500">
                        ({filteredTasks.length} نقطة تنفيذ)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-200 text-[11px] text-slate-600 font-semibold shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>مواقع موثقة فقط</span>
                    </div>
                  </div>

                  {/* Real GPS locations only; no simulated location pins */}
                  <div className="relative z-10 flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 my-auto p-4 max-h-[420px] overflow-y-auto no-scrollbar">
                    {filteredTasks.map((task) => {
                      const isSelected = selectedTask?.id === task.id;
                      const isRunning = task.status === 'in_progress' || task.status === 'started';
                      const isDone = task.status === 'completed' || task.status === 'approved';

                      return (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                            isSelected
                              ? 'bg-white border-[#2A443B] ring-2 ring-[#2A443B]/20 scale-102'
                              : 'bg-white/80 hover:bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                              {task.code || 'TSK'}
                            </span>
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                isRunning
                                  ? 'bg-emerald-500 animate-pulse'
                                  : isDone
                                  ? 'bg-slate-400'
                                  : 'bg-blue-500'
                              }`}
                            />
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 line-clamp-1 mb-1">
                            {task.title}
                          </h4>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 line-clamp-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{task.location}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Map Legend */}
                  <div className="relative z-10 flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-slate-300/60 text-[11px] font-semibold text-slate-600">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> قيد التنفيذ الآن
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> مجدولة
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> متوقفة مؤقتاً
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> مكتملة
                      </span>
                    </div>

                    <span className="text-slate-400 text-[10px]">
                      هذه قائمة مهام ذات إحداثيات حقيقية وليست خريطة GPS مباشرة
                    </span>
                  </div>
                </div>
              )}
            </div>
            {tasksWithoutCoords.length > 0 && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4" /> مهام دون إحداثيات GPS ({tasksWithoutCoords.length})</div>
                <p className="mt-1 text-xs text-amber-800">لم نضع لها نقاطًا تقديرية؛ تظهر هنا حتى لا تختلط المواقع الحقيقية بالمواقع الافتراضية.</p>
                <div className="mt-3 space-y-2">
                  {tasksWithoutCoords.slice(0, 8).map((task) => (
                    <button key={task.id} type="button" onClick={() => setSelectedTask(task)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/80 p-2.5 text-right text-xs hover:bg-white">
                      <span className="min-w-0"><strong className="block truncate text-slate-800">{task.title}</strong><span className="text-slate-500">{task.location || 'موقع غير محدد'}</span></span>
                      <span className="shrink-0 font-bold text-amber-800">عرض</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats Grid under Map */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="inner-white-card p-3.5">
              <span className="text-slate-500 block mb-0.5">المهام الميدانية النشطة</span>
              <span className="text-lg font-black text-emerald-700">
                {visibleTasks.filter((t) => t.status === 'in_progress' || t.status === 'started').length}
              </span>
            </div>
            <div className="inner-white-card p-3.5">
              <span className="text-slate-500 block mb-0.5">زيارات اليوم المجدولة</span>
              <span className="text-lg font-black text-blue-700">
                {visibleTasks.filter((t) => t.status === 'scheduled').length}
              </span>
            </div>
            <div className="inner-white-card p-3.5">
              <span className="text-slate-500 block mb-0.5">المعلقة والمؤجلة</span>
              <span className="text-lg font-black text-amber-700">
                {visibleTasks.filter((t) => t.status === 'paused' || t.status === 'deferred').length}
              </span>
            </div>
            <div className="inner-white-card p-3.5">
              <span className="text-slate-500 block mb-0.5">المكتملة اليوم</span>
              <span className="text-lg font-black text-slate-800">
                {visibleTasks.filter((t) => t.status === 'completed' || t.status === 'approved').length}
              </span>
            </div>
          </div>
        </div>

        {/* Selected Task Details Sheet / Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          {selectedTask ? (
            <div className="inner-white-card p-5 space-y-5 animate-in slide-in-from-right-3">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-[#2A443B] text-white">
                      {selectedTask.code || 'TSK'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                      {selectedTask.taskType || 'مهمة ميدانية'}
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                    {selectedTask.title}
                  </h3>
                </div>

                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Status & Priority */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">الحالة الميدانية:</span>
                <span
                  className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                    selectedTask.status === 'in_progress'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedTask.status === 'paused'
                      ? 'bg-amber-100 text-amber-800'
                      : selectedTask.status === 'completed'
                      ? 'bg-slate-100 text-slate-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {TASK_STATUS_CONFIG[selectedTask.status]?.label || selectedTask.status}
                </span>
              </div>

              {/* Location & Coordinates */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{selectedTask.location}</span>
                </div>
                {selectedTask.geoCoordinates && (
                  <div className="text-[11px] text-slate-500 font-mono flex items-center justify-between">
                    <span>GPS: {selectedTask.geoCoordinates.lat.toFixed(5)}, {selectedTask.geoCoordinates.lng.toFixed(5)}</span>
                    <a
                      href={`https://www.google.com/maps?q=${selectedTask.geoCoordinates.lat},${selectedTask.geoCoordinates.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#2A443B] font-bold underline flex items-center gap-1"
                    >
                      <span>جوجل ماب</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Exact Execution Time Tracking */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>ساعة البدء الفعلي:</span>
                  </span>
                  <span className="font-bold text-slate-800">
                    {selectedTask.actualStartTime
                      ? new Date(selectedTask.actualStartTime).toLocaleTimeString('ar-AE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : 'لم تبدأ بعد'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>ساعة الإنجاز والإنهاء:</span>
                  </span>
                  <span className="font-bold text-slate-800">
                    {selectedTask.actualEndTime
                      ? new Date(selectedTask.actualEndTime).toLocaleTimeString('ar-AE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>الوقت المستغرق:</span>
                  </span>
                  <span className="font-bold text-emerald-700">
                    {selectedTask.timeSpentMinutes ? `${selectedTask.timeSpentMinutes} دقيقة عمل` : '0 دقيقة'}
                  </span>
                </div>
              </div>

              {/* Financial Snapshot */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-emerald-800/80 block text-[11px]">المصروف الفعلي</span>
                  <span className="font-extrabold text-emerald-950 text-sm">
                    {formatCurrency(selectedTask.spentAmount || 0)}
                  </span>
                </div>
                <div className="text-left">
                  <span className="text-emerald-800/80 block text-[11px]">الميزانية المقدرة</span>
                  <span className="font-extrabold text-emerald-900 text-sm">
                    {formatCurrency(selectedTask.budget || 0)}
                  </span>
                </div>
              </div>

              {/* Primary Execution Control Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {canEditTask && selectedTask.status === 'scheduled' && (
                  <button
                    onClick={() => handleStartTaskWithLocation(selectedTask)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#2A443B] hover:bg-[#1f332c] text-white text-xs font-bold font-sans-inter transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>بدء المهمة وتوثيق الوقت والموقع (GPS)</span>
                  </button>
                )}

                {canEditTask && selectedTask.status === 'in_progress' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handlePauseTask(selectedTask)}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <Pause className="w-4 h-4" />
                      <span>إيقاف مؤقت</span>
                    </button>
                    <button
                      onClick={() => onRecordOutcome(selectedTask)}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>إنهاء وإغلاق</span>
                    </button>
                  </div>
                )}

                {canEditTask && selectedTask.status === 'paused' && (
                  <button
                    onClick={() => handleResumeTask(selectedTask)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>استئناف العمل الميداني</span>
                  </button>
                )}

                <button
                  onClick={() => onSelectTask(selectedTask)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  <span>عرض بطاقة المهمة الكاملة والمرفقات</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="inner-white-card p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#2A443B] flex items-center justify-center mx-auto">
                <MapPin className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-800">تفاصيل الموقع والمهمة</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  حدد أي نقطة أو مهمة على الخريطة لعرض تفاصيل الموقع وساعة البدء والانتهاء، والتحكم بمسار التنفيذ الميداني فورياً.
                </p>
              </div>

              {/* Quick List of Active Tasks */}
              <div className="text-right space-y-2 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  أحدث المهام الميدانية:
                </span>
                {visibleTasks.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTask(t)}
                    className="p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-100 transition cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-1">
                      <span className="font-bold text-slate-800 block truncate">{t.title}</span>
                      <span className="text-[10px] text-slate-400 block truncate">{t.location}</span>
                    </div>
                    <span className="text-[10px] font-bold text-[#2A443B] shrink-0">
                      {t.assigneeName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
