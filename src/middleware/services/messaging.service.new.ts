import { IMessagingRepository } from "@/backend/domain/interfaces/IMessagingRepository";
import { MessagingRepository } from "@/backend/repositories/MessagingRepository";
import { IUserRepository } from "@/backend/domain/interfaces/IUserRepository";
import { UserRepository } from "@/backend/repositories/UserRepository";
import { IPresenceRepository } from "@/backend/domain/interfaces/IPresenceRepository";
import { PresenceRepository } from "@/backend/repositories/PresenceRepository";

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
  senderId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: "TEXT" | "PHOTO" | "VIDEO";
}

export interface TypingIndicatorResponse {
  success: boolean;
  error?: string;
}

class MessagingService {
  private messagingRepository: IMessagingRepository;
  private userRepository: IUserRepository;
  private presenceRepository: IPresenceRepository;

  constructor(
    messagingRepository?: IMessagingRepository,
    userRepository?: IUserRepository,
    presenceRepository?: IPresenceRepository,
  ) {
    this.messagingRepository = messagingRepository || new MessagingRepository();
    this.userRepository = userRepository || new UserRepository();
    this.presenceRepository = presenceRepository || new PresenceRepository();
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationResponse> {
    try {
      const conversation =
        await this.messagingRepository.getConversationById(conversationId);

      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        return { success: false, error: "Access denied" };
      }

      const otherUserId =
        conversation.user1Id === userId
          ? conversation.user2Id
          : conversation.user1Id;
      const otherUserProfile =
        await this.userRepository.getProfileByUserId(otherUserId);

      const conversationWithProfile = {
        ...conversation,
        otherUser: otherUserProfile,
      };

      return { success: true, conversation: conversationWithProfile };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getConversations(userId: string): Promise<ConversationListResponse> {
    try {
      const conversations =
        await this.messagingRepository.getConversationsForUser(userId);

      const conversationsWithProfiles = await Promise.all(
        conversations.map(async (conversation) => {
          const otherUserId =
            conversation.user1Id === userId
              ? conversation.user2Id
              : conversation.user1Id;
          const otherUserProfile =
            await this.userRepository.getProfileByUserId(otherUserId);

          return {
            ...conversation,
            otherUser: otherUserProfile,
          };
        }),
      );

      conversationsWithProfiles.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return { success: true, conversations: conversationsWithProfiles };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getOrCreateConversation(
    user1Id: string,
    user2Id: string,
  ): Promise<ConversationResponse> {
    try {
      let conversation =
        await this.messagingRepository.getConversationBetweenUsers(
          user1Id,
          user2Id,
        );

      if (!conversation) {
        conversation = await this.messagingRepository.createConversation(
          user1Id,
          user2Id,
        );
      }

      const otherUserProfile =
        await this.userRepository.getProfileByUserId(user2Id);

      const conversationWithProfile = {
        ...conversation,
        otherUser: otherUserProfile,
      };

      return { success: true, conversation: conversationWithProfile };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getMessages(
    conversationId: string,
    userId: string,
    limit?: number,
  ): Promise<MessageListResponse> {
    try {
      const conversation =
        await this.messagingRepository.getConversationById(conversationId);

      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        return { success: false, error: "Access denied" };
      }

      const messages =
        await this.messagingRepository.getMessagesByConversationId(
          conversationId,
          limit,
        );

      return { success: true, messages };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async sendMessage(request: SendMessageRequest): Promise<MessageResponse> {
    try {
      const conversation = await this.messagingRepository.getConversationById(
        request.conversationId,
      );

      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      if (
        conversation.user1Id !== request.senderId &&
        conversation.user2Id !== request.senderId
      ) {
        return { success: false, error: "Access denied" };
      }

      if (conversation.isFrozen) {
        return { success: false, error: "Conversation is frozen" };
      }

      const message = await this.messagingRepository.createMessage({
        conversationId: request.conversationId,
        senderId: request.senderId,
        content: request.content,
        mediaUrl: request.mediaUrl,
        mediaType: request.mediaType || "TEXT",
      });

      await this.messagingRepository.createMessageEvent({
        messageId: message.id,
        eventType: "sent",
        userId: request.senderId,
        eventData: { sent_at: new Date().toISOString() },
      });

      const otherUserId =
        conversation.user1Id === request.senderId
          ? conversation.user2Id
          : conversation.user1Id;
      await this.messagingRepository.markMessageAsDelivered(message.id);

      return { success: true, message };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async markMessageAsSeen(
    messageId: string,
    userId: string,
  ): Promise<MessageResponse> {
    try {
      const message = await this.messagingRepository.getMessageById(messageId);

      if (!message) {
        return { success: false, error: "Message not found" };
      }

      if (message.senderId === userId) {
        return {
          success: false,
          error: "You cannot mark your own message as seen",
        };
      }

      const conversation = await this.messagingRepository.getConversationById(
        message.conversationId,
      );

      if (
        !conversation ||
        (conversation.user1Id !== userId && conversation.user2Id !== userId)
      ) {
        return { success: false, error: "Access denied" };
      }

      const updatedMessage = await this.messagingRepository.markMessageAsSeen(
        messageId,
        userId,
      );

      return { success: true, message: updatedMessage };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async freezeConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationResponse> {
    try {
      const conversation =
        await this.messagingRepository.getConversationById(conversationId);

      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        return { success: false, error: "Access denied" };
      }

      if (conversation.isFrozen) {
        return { success: false, error: "Conversation is already frozen" };
      }

      const updatedConversation =
        await this.messagingRepository.freezeConversation(
          conversationId,
          userId,
        );

      return { success: true, conversation: updatedConversation };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async unfreezeConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationResponse> {
    try {
      const conversation =
        await this.messagingRepository.getConversationById(conversationId);

      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        return { success: false, error: "Access denied" };
      }

      if (!conversation.isFrozen) {
        return { success: false, error: "Conversation is not frozen" };
      }

      const updatedConversation =
        await this.messagingRepository.unfreezeConversation(conversationId);

      return { success: true, conversation: updatedConversation };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async setTypingIndicator(
    conversationId: string,
    userId: string,
    speed: "slow" | "normal" | "fast" | "furious",
  ): Promise<TypingIndicatorResponse> {
    try {
      const conversation =
        await this.messagingRepository.getConversationById(conversationId);

      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        return { success: false, error: "Access denied" };
      }

      await this.messagingRepository.setTypingIndicator(
        conversationId,
        userId,
        speed,
      );

      await this.presenceRepository.ensurePresenceExists(userId);
      const otherUserId =
        conversation.user1Id === userId
          ? conversation.user2Id
          : conversation.user1Id;
      await this.presenceRepository.setTypingInChat(userId, otherUserId);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async clearTypingIndicator(
    conversationId: string,
    userId: string,
  ): Promise<TypingIndicatorResponse> {
    try {
      const conversation =
        await this.messagingRepository.getConversationById(conversationId);

      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        return { success: false, error: "Access denied" };
      }

      await this.messagingRepository.clearTypingIndicator(
        conversationId,
        userId,
      );

      await this.presenceRepository.ensurePresenceExists(userId);
      await this.presenceRepository.clearTypingInChat(userId);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getTypingIndicators(
    conversationId: string,
    userId: string,
  ): Promise<any> {
    try {
      const conversation =
        await this.messagingRepository.getConversationById(conversationId);

      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        return { success: false, error: "Access denied" };
      }

      const typingIndicators =
        await this.messagingRepository.getTypingIndicators(conversationId);

      const otherUserTyping = typingIndicators.find(
        (indicator) => indicator.userId !== userId,
      );

      return { success: true, typingUser: otherUserTyping };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getMessageEvents(messageId: string, userId: string): Promise<any> {
    try {
      const message = await this.messagingRepository.getMessageById(messageId);

      if (!message) {
        return { success: false, error: "Message not found" };
      }

      const conversation = await this.messagingRepository.getConversationById(
        message.conversationId,
      );

      if (
        !conversation ||
        (conversation.user1Id !== userId && conversation.user2Id !== userId)
      ) {
        return { success: false, error: "Access denied" };
      }

      const events = await this.messagingRepository.getMessageEvents(messageId);

      return { success: true, events };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }
}

const messagingService = new MessagingService();
export default messagingService;
