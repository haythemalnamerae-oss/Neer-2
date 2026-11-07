import { dataStore } from '../lib/storage';
import { NotificationItem } from '../types/domain';

export class NotificationsService {
  public static getAll(): NotificationItem[] {
    return dataStore.getNotifications();
  }

  public static getUnreadCount(): number {
    return dataStore.getNotifications().filter((n) => !n.isRead).length;
  }

  public static markAsRead(id: string): void {
    dataStore.markNotificationRead(id);
  }

  public static markAllAsRead(): void {
    dataStore.markAllNotificationsRead();
  }
}
