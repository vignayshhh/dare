export type MediaType = "TEXT" | "PHOTO" | "VIDEO";

export interface ConversationResponse {
  success: boolean;
  conversation?: any;
  error?: string;
}

export interface ConversationListResponse {
  success: boolean;
  conversations?: any[];
  error?: string;
}

export interface MessageResponse {
  success: boolean;
  message?: any;
  error?: string;
}

export interface MessageListResponse {
  success: boolean;
  messages?: any[];
  error?: string;
}

export interface SendMessageRequest {
  conversationId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: MediaType;
}

export interface MarkMessageSeenRequest {
  messageId: string;
}

export interface FreezeConversationRequest {
  conversationId: string;
}

export interface SetTypingIndicatorRequest {
  conversationId: string;
  speed: "slow" | "normal" | "fast" | "furious";
}

export interface TypingIndicatorResponse {
  success: boolean;
  error?: string;
}

export interface GetMessagesRequest {
  conversationId: string;
  limit?: number;
}

export interface GetConversationRequest {
  conversationId: string;
}

export interface CreateConversationRequest {
  userId: string;
}
