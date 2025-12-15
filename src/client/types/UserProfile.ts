/**
 * User profile interface
 */
export interface UserProfile {
  _id: string;
  username: string;
  email: string;
  avatar: string;
  roles?: string[];
  unread_messages: boolean;
  unread_notifications: boolean;
}

