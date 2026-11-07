import React, { useState, useEffect } from 'react';
import { dataStore } from './lib/storage';
import { Task } from './types/domain';

// Layout
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { GlobalQuickActionFab } from './components/layout/GlobalQuickActionFab';

// Views
import { DailyCommandCenterView } from './components/views/DailyCommandCenterView';
import { ApprovalsCenterView } from './components/views/ApprovalsCenterView';
import { DashboardView } from './components/views/DashboardView';
import { TasksView } from './components/views/TasksView';
import { FollowUpsView } from './components/views/FollowUpsView';
import { FundsView } from './components/views/FundsView';
import { ExpensesView } from './components/views/ExpensesView';
import { SettlementsView } from './components/views/SettlementsView';
import { CalendarView } from './components/views/CalendarView';
import { ReportsView } from './components/views/ReportsView';
import { TeamView } from './components/views/TeamView';
import { UsersView } from './components/views/UsersView';
import { RolesView } from './components/views/RolesView';
import { AuditLogsView } from './components/views/AuditLogsView';
import { SettingsView } from './components/views/SettingsView';
import { CodeRepositoryViewer } from './components/code/CodeRepositoryViewer';

// Modals
import { NewTaskModal } from './components/modals/NewTaskModal';
import { NewExpenseModal } from './components/modals/NewExpenseModal';
import { NewFundModal } from './components/modals/NewFundModal';
import { NewSettlementModal } from './components/modals/NewSettlementModal';
import { TaskDetailsModal } from './components/modals/TaskDetailsModal';
import { TaskOutcomeModal } from './components/modals/TaskOutcomeModal';
import { TaskChainModal } from './components/modals/TaskChainModal';

export default function App() {
  const [, setStoreVersion] = useState(0);
  const [currentView, setCurrentView] = useState<string>('daily');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Modal States
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isNewExpenseModalOpen, setIsNewExpenseModalOpen] = useState(false);
  const [preselectedTaskIdForExpense, setPreselectedTaskIdForExpense] = useState<string | undefined>();
  const [isNewFundModalOpen, setIsNewFundModalOpen] = useState(false);
  const [isNewSettlementModalOpen, setIsNewSettlementModalOpen] = useState(false);

  // Task Action Modals
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);
  const [selectedTaskForOutcome, setSelectedTaskForOutcome] = useState<Task | null>(null);
  const [selectedTaskForChain, setSelectedTaskForChain] = useState<Task | null>(null);

  // Reactive subscription to OpsDataStore
  useEffect(() => {
    return dataStore.subscribe(() => {
      setStoreVersion((v) => v + 1);
    });
  }, []);

  const currentUser = dataStore.getCurrentUser();

  // Handlers for cross-component workflows
  const handleOpenNewTask = () => {
    setIsNewTaskModalOpen(true);
  };

  const handleOpenNewExpense = (taskId?: string) => {
    setPreselectedTaskIdForExpense(taskId);
    setIsNewExpenseModalOpen(true);
  };

  const handleSelectTask = (task: Task) => {
    setSelectedTaskForDetails(task);
  };

  const handleRecordOutcome = (task: Task) => {
    setSelectedTaskForOutcome(task);
  };

  const handleViewChain = (task: Task) => {
    setSelectedTaskForChain(task);
  };

  const handleSelectView = (view: string) => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen neu-bg text-slate-800 flex font-['Cairo',sans-serif] antialiased selection:bg-[#4C755D] selection:text-white dir-rtl transition-colors duration-200">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onSelectView={handleSelectView}
        currentUser={currentUser}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200">
        {/* Top Header */}
        <Header
          currentUser={currentUser}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          onOpenNewTask={handleOpenNewTask}
          onOpenNewExpense={() => handleOpenNewExpense()}
          onSelectView={handleSelectView}
          currentView={currentView}
        />

        {/* Dynamic View Body */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-28 lg:pb-8 max-w-7xl w-full mx-auto">
          {currentView === 'daily' && (
            <DailyCommandCenterView
              onOpenNewTask={handleOpenNewTask}
              onOpenNewExpense={(taskId) => handleOpenNewExpense(taskId)}
              onSelectTask={handleSelectTask}
              onRecordOutcome={handleRecordOutcome}
              onViewChain={handleViewChain}
              onSelectView={handleSelectView}
            />
          )}

          {currentView === 'approvals' && (
            <ApprovalsCenterView onSelectView={handleSelectView} />
          )}

          {currentView === 'dashboard' && (
            <DashboardView
              onOpenNewTask={handleOpenNewTask}
              onOpenNewExpense={() => handleOpenNewExpense()}
              onSelectView={handleSelectView}
            />
          )}

          {currentView === 'tasks' && (
            <TasksView
              onOpenNewTask={handleOpenNewTask}
              onSelectTask={handleSelectTask}
              onRecordOutcome={handleRecordOutcome}
              onViewChain={handleViewChain}
            />
          )}

          {currentView === 'followUps' && (
            <FollowUpsView
              onSelectTask={handleSelectTask}
              onRecordOutcome={handleRecordOutcome}
              onViewChain={handleViewChain}
            />
          )}

          {currentView === 'funds' && (
            <FundsView
              onOpenNewFund={() => setIsNewFundModalOpen(true)}
              onOpenNewSettlement={() => setIsNewSettlementModalOpen(true)}
              onSelectView={handleSelectView}
            />
          )}

          {currentView === 'expenses' && (
            <ExpensesView onOpenNewExpense={() => handleOpenNewExpense()} />
          )}

          {currentView === 'settlements' && (
            <SettlementsView onOpenNewSettlement={() => setIsNewSettlementModalOpen(true)} />
          )}

          {currentView === 'calendar' && (
            <CalendarView
              onSelectTask={handleSelectTask}
              onOpenNewTask={handleOpenNewTask}
            />
          )}

          {currentView === 'reports' && <ReportsView />}

          {currentView === 'team' && <TeamView />}

          {currentView === 'users' && <UsersView />}

          {currentView === 'roles' && <RolesView />}

          {currentView === 'audit' && <AuditLogsView />}

          {currentView === 'settings' && <SettingsView />}

          {(currentView === 'code' || currentView === 'codeViewer') && (
            <CodeRepositoryViewer onBackToDashboard={() => handleSelectView('daily')} />
          )}
        </main>
      </div>

      {/* Mobile Floating Bottom Navigation Bar */}
      <MobileBottomNav
        currentView={currentView}
        onSelectView={handleSelectView}
      />

      {/* Global Quick Action Floating Button */}
      <GlobalQuickActionFab
        onOpenNewTask={handleOpenNewTask}
        onOpenNewExpense={() => handleOpenNewExpense()}
        onSelectView={handleSelectView}
      />

      {/* --- Global Modals --- */}
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
      />

      <NewExpenseModal
        isOpen={isNewExpenseModalOpen}
        onClose={() => {
          setIsNewExpenseModalOpen(false);
          setPreselectedTaskIdForExpense(undefined);
        }}
        preselectedTaskId={preselectedTaskIdForExpense}
      />

      <NewFundModal
        isOpen={isNewFundModalOpen}
        onClose={() => setIsNewFundModalOpen(false)}
      />

      <NewSettlementModal
        isOpen={isNewSettlementModalOpen}
        onClose={() => setIsNewSettlementModalOpen(false)}
      />

      <TaskDetailsModal
        task={selectedTaskForDetails}
        isOpen={Boolean(selectedTaskForDetails)}
        onClose={() => setSelectedTaskForDetails(null)}
        onRecordOutcome={(t) => {
          setSelectedTaskForDetails(null);
          setSelectedTaskForOutcome(t);
        }}
        onViewChain={(t) => {
          setSelectedTaskForDetails(null);
          setSelectedTaskForChain(t);
        }}
        onAddExpense={(taskId) => {
          setSelectedTaskForDetails(null);
          handleOpenNewExpense(taskId);
        }}
      />

      <TaskOutcomeModal
        task={selectedTaskForOutcome}
        isOpen={Boolean(selectedTaskForOutcome)}
        onClose={() => setSelectedTaskForOutcome(null)}
        onSuccess={() => {
          setSelectedTaskForOutcome(null);
        }}
        onViewChain={(t) => {
          setSelectedTaskForOutcome(null);
          setSelectedTaskForChain(t);
        }}
      />

      <TaskChainModal
        task={selectedTaskForChain}
        isOpen={Boolean(selectedTaskForChain)}
        onClose={() => setSelectedTaskForChain(null)}
        onSelectTask={(t) => {
          setSelectedTaskForChain(null);
          setSelectedTaskForDetails(t);
        }}
      />
    </div>
  );
}
