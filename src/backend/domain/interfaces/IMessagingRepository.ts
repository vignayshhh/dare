export type MediaType = "TEXT" | "PHOTO" | "VIDEO";

export interface Conversation {
  id: string;
  user1Id: string;
  user2Id: string;
  lastMessageId: string | null;
  isActive: boolean;
  isFrozen: boolean;
  frozenBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  mediaUrl: string | null;
  mediaType: MediaType;
  isDelivered: boolean;
  isSeen: boolean;
  createdAt: string;
}

export interface MessageEvent {
  id: string;
  messageId: string;
  eventType: "sent" | "delivered" | "seen" | "screenshot" | "typing_started" | "typing_stopped" | "almost_sent";
  userId: string;
  eventData: any;
  createdAt: string;
}

export interface TypingIndicator {
  id: string;
  conversationId: string;
  userId: string;
  typingSpeed: "slow" | "normal" | "fast" | "furious";
  startedAt: string;
}

export interface CreateMessageRequest {
  conversationId: string;
  senderId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: MediaType;
}

export interface IMessagingRepository {
  getConversationById(conversationId: string): Promise<Conversation | null>;
  getConversationBetweenUsers(user1Id: string, user2Id: string): Promise<Conversation | null>;
  getConversationsForUser(userId: string): Promise<Conversation[]>;
  createConversation(user1Id: string, user2Id: string): Promise<Conversation>;
  updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<Conversation>;
  freezeConversation(conversationId: string, frozenBy: string): Promise<Conversation>;
  unfreezeConversation(conversationId: string): Promise<Conversation>;

  getMessagesByConversationId(conversationId: string, limit?: number): Promise<Message[]>;
  getMessageById(messageId: string): Promise<Message | null>;
  createMessage(request: CreateMessageRequest): Promise<Message>;
  updateMessage(messageId: string, updates: Partial<Message>): Promise<Message>;
  markMessageAsDelivered(messageId: string): Promise<Message>;
  markMessageAsSeen(messageId: string, userId: string): Promise<Message>;

  createMessageEvent(event: Omit<MessageEvent, "id" | "createdAt">): Promise<MessageEvent>;
  getMessageEvents(messageId: string): Promise<MessageEvent[]>;

  setTypingIndicator(conversationId: string, userId: string, speed: "slow" | "normal" | "fast" | "furious"): Promise<TypingIndicator>;
  clearTypingIndicator(conversationId: string, userId: string): Promise<void>;
  getTypingIndicators(conversationId: string): Promise<TypingIndicator[]>;
}
