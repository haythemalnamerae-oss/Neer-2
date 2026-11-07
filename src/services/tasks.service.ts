import { dataStore } from '../lib/storage';
import { Task, TaskPriority, TaskStatus } from '../types/domain';

export class TasksService {
  public static getAll(): Task[] {
    return dataStore.getTasks();
  }

  public static getById(id: string): Task | undefined {
    return dataStore.getTasks().find((t) => t.id === id);
  }

  public static create(data: Omit<Task, 'id' | 'spentAmount' | 'history' | 'createdAt'>): Task {
    return dataStore.addTask(data);
  }

  public static updateStatus(id: string, status: TaskStatus): void {
    dataStore.updateTaskStatus(id, status);
  }

  public static toggleChecklist(taskId: string, itemId: string): void {
    dataStore.toggleTaskChecklistItem(taskId, itemId);
  }

  public static delete(id: string): void {
    dataStore.deleteTask(id);
  }

  public static filter(params: {
    status?: TaskStatus | 'all';
    priority?: TaskPriority | 'all';
    assigneeId?: string;
    search?: string;
  }): Task[] {
    let tasks = dataStore.getTasks();
    if (params.status && params.status !== 'all') {
      tasks = tasks.filter((t) => t.status === params.status);
    }
    if (params.priority && params.priority !== 'all') {
      tasks = tasks.filter((t) => t.priority === params.priority);
    }
    if (params.assigneeId) {
      tasks = tasks.filter((t) => t.assigneeId === params.assigneeId);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.location.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return tasks;
  }
}
