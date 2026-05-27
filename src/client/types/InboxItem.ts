import { Notification } from "./Notification";
import { Conversation } from "./Conversation";

export type InboxItemType = "notification" | "conversation";

export interface BaseInboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  preview: string;
  time: string;
  unread: boolean;
}

export interface NotificationInboxItem extends BaseInboxItem {
  type: "notification";
  icon: string;
  originalData: Notification;
}

export interface ConversationInboxItem extends BaseInboxItem {
  type: "conversation";
  participantInfo?: Conversation["participantInfo"];
  messageCount?: number;
  originalData: Conversation;
}

export type InboxItem = NotificationInboxItem | ConversationInboxItem;