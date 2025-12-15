/**
 * Notification interface
 */
export interface Notification {
  _id: string;
  title: string;
  message: string;
  time: string;
  icon: string;
  unread: boolean;
}

