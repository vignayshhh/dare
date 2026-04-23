import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { messagingService } from "@/middleware/services/messaging.service";
import { surveillanceService } from "@/middleware/services/service-factory";
import { useAuthStore } from "./useAuthStore-v2";
import {
  presenceService,
  Presence,
} from "@/middleware/services/presence.service";
import { ghostModeService } from "@/middleware/services/ghost-mode.service";
import type {
  Conversation,
  Message,
  MessageEvent,
} from "@/middleware/services/messaging.service";

// Re-export MessageEvent for components
export { MessageEvent };

// Extended Message interface with legacy properties for UI compatibility
export interface ExtendedMessage extends Message {
  // Legacy properties for UI compatibility
  senderId: string;
  senderName: string;
  senderAvatar: string;
  timestamp: string;
  isOwn: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | null;
}

// ConversationWithUser type for current conversation
interface ConversationWithUser {
  id: string;
  other_user: {
    user_id: string;
    id: string;
    display_name: string;
    username: string;
    avatar_url: string;
  };
  last_message_content: string;
  last_message_at: string;
  unread_count: number;
  is_online: boolean;
  is_typing: boolean;
  typing_speed?: string;
  created_at: string;
  updated_at: string;
}

// Track when messages are seen for ignored message logic
interface SeenMessage {
  messageId: string;
  conversationId: string;
  seenAt: number;
  senderId: string;
  senderName: string;
}

// Track which messages have already triggered ignored events to prevent spam
const ignoredMessages = new Set<string>();
const ignoredConversations = new Set<string>();
const ignoredTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface CreateMessageRequest {
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url?: string;
  media_type?: string;
}

export interface TypingUser {
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  speed?: string;
  started_at: string;
}

export interface DareRequest {
  id: string;
  conversation_id: string;
  requester_id: string;
  content: string;
  created_at: string;
}

export interface DareResponse {
  id: string;
  request_id: string;
  responder_id: string;
  response: string;
  created_at: string;
}

export interface MessagingStoreState {
  conversations: any[];
  messages: any[];
  loading: boolean;
  loadingMessages: boolean;
  error: string | null;
  sendingMessage: boolean;
  isTyping: boolean;
  isConversationFrozen: boolean;
}

export interface MessagingStore {
  // State
  conversations: any[];
  currentConversation: ConversationWithUser | null;
  messages: any[];
  events: MessageEvent[];
  loading: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  hasMoreMessages: boolean;
  error: string | null;
  sendingMessage: boolean;
  typingUsers: TypingUser[];
  messageEvents: MessageEvent[];
  dareRequests: DareRequest[];
  dareResponses: DareResponse[];
  onlineFriends: string[];
  realTimeSubscriptions: Map<string, () => void>;
  frozenBy: string | null;
  seenMessages: SeenMessage[]; // Track seen messages for ignored logic
  friendDraft: string | null; // Live draft text from the other user

  // Computed values
  unreadCount: number;
  hasActiveConversation: boolean;
  isTyping: boolean;
  isConversationFrozen: boolean;

  // Actions
  loadConversations: (userId: string) => Promise<void>;
  getOrCreateConversation: (
    userId1: string,
    userId2: string,
  ) => Promise<string>;
  loadMessages: (conversationId: string, userId: string) => Promise<void>;
  sendMessage: (request: CreateMessageRequest) => Promise<void>;
  markMessagesAsSeen: (conversationId: string, userId: string) => Promise<void>;
  subscribeToConversation: (
    conversationId: string,
    callback: (payload: any) => void,
  ) => void;
  unsubscribeFromConversation: (conversationId: string) => void;
  clearCurrentConversation: () => void;
  setCurrentConversation: (conversation: ConversationWithUser | null) => void;
  clearError: () => void;

  // Event tracking methods
  trackScreenshot: (
    conversationId: string,
    messageId?: string,
  ) => Promise<void>;
  trackChatSwitch: (
    conversationId: string,
    targetUserName: string,
    targetUserId: string,
    recipientUserId?: string,
  ) => Promise<void>;
  trackOpenedNoReply: (conversationId: string) => Promise<void>;
  trackLongUnsent: (conversationId: string, content: string) => Promise<void>;
  trackMention: (
    conversationId: string,
    mentionedUsername: string,
  ) => Promise<void>;
  trackIgnoredMessage: (
    conversationId: string,
    targetUserName: string,
  ) => Promise<void>;
  trackSeenMessage: (
    messageId: string,
    conversationId: string,
    senderId: string,
    senderName: string,
  ) => void;
  checkIgnoredMessage: (
    messageId: string,
    conversationId: string,
    senderId: string,
    senderName: string,
  ) => void;
  clearIgnoredTracking: (conversationId: string) => void;

  // Legacy methods (keep for compatibility)
  trackScreenshotLegacy: (messageId: string, userId: string) => Promise<void>;
  trackAlmostSent: (
    conversationId: string,
    userId: string,
    content: string,
  ) => Promise<void>;
  startTyping: (
    conversationId: string,
    userId: string,
    speed: "slow" | "medium" | "fast",
  ) => Promise<void>;
  stopTyping: (conversationId: string, userId: string) => Promise<void>;
  freezeConversation: (conversationId: string, userId: string) => Promise<void>;
  unfreezeConversation: (
    conversationId: string,
    userId: string,
  ) => Promise<void>;
  deleteMessage: (messageId: string, userId: string) => Promise<void>;
  initiateRandomChatDare: (userId: string, friendId: string) => Promise<void>;
  respondToRandomChatDare: (
    conversationIdOrUserId: string,
    userIdOrDareId: string,
    acceptOrResponse: boolean | string,
  ) => Promise<void>;

  loadOlderMessages: () => Promise<void>;

  // REAL-TIME METHODS
  subscribeToRealTimeConversations: (userId: string) => void;
  unsubscribeFromRealTimeConversations: () => void;
  subscribeToRealTimeMessages: (conversationId: string) => void;
  unsubscribeFromRealTimeMessages: () => void;
  subscribeToRealTimeEvents: (conversationId: string) => void;
  unsubscribeFromRealTimeEvents: () => void;
  sendRealTimeMessage: (
    conversationId: string,
    content: string,
    mediaUrl?: string,
    mediaType?: "TEXT" | "PHOTO" | "VIDEO",
  ) => Promise<void>;
  markMessageAsSeen: (messageId: string) => Promise<void>;
  setTypingIndicator: (
    conversationId: string,
    isTyping: boolean,
    speed?: "slow" | "normal" | "fast" | "furious",
  ) => void;
  subscribeToOnlineStatus: (userId: string) => void;
  unsubscribeFromOnlineStatus: () => void;
  setOnlineStatus: (isOnline: boolean) => void;

  // Typing subscription (listen for other users)
  subscribeToTypingIndicators: (conversationId: string) => void;
  unsubscribeFromTypingIndicators: () => void;

  // Freeze chat
  freezeChat: (conversationId: string) => void;
  unfreezeChat: (conversationId: string) => void;
  subscribeToFreezeStatus: (conversationId: string) => void;
  unsubscribeFromFreezeStatus: () => void;

  // Live draft text (letter-by-letter preview)
  setDraftText: (conversationId: string, text: string) => void;
  clearDraftText: (conversationId: string) => void;
  subscribeToDraftText: (conversationId: string) => void;
  unsubscribeFromDraftText: () => void;
}

// Normalize any raw message object (from REST or real-time) into the
// consistent shape the UI expects. Always pass the current userId so
// `senderId` can be compared correctly in MessagingScreen.
function normalizeMessage(msg: any, currentUserId: string): ExtendedMessage {
  // Support both shapes:
  //   • real-time: { sender: { user_id, display_name, avatar_url }, ... }
  //   • optimistic / already-normalized: { senderId, senderName, ... }
  const senderId: string = msg.sender?.user_id ?? msg.senderId ?? "";

  return {
    id: msg.id,
    sender_id: msg.sender_id,
    conversation_id: msg.conversation_id,
    content: msg.content,
    media_url: msg.media_url,
    media_type: msg.media_type,
    created_at: msg.created_at,
    updated_at: msg.updated_at,
    is_delivered: msg.is_delivered,
    is_seen: msg.is_seen,
    // Legacy properties for compatibility
    senderId: msg.sender_id,
    senderName: msg.senderName || "",
    senderAvatar: msg.senderAvatar || "",
    timestamp: msg.created_at,
    isOwn: msg.sender_id === currentUserId,
    mediaUrl: msg.media_url,
    mediaType: msg.media_type
      ? (msg.media_type.toLowerCase() as "image" | "video" | "audio")
      : undefined,
  };
}

export const useMessagingStore = create<MessagingStore>((set, get) => ({
  // Initial state
  conversations: [],
  currentConversation: null,
  messages: [],
  events: [], // Add missing events property
  loading: false,
  loadingMessages: false,
  loadingOlderMessages: false,
  hasMoreMessages: false,
  error: null,
  sendingMessage: false,
  typingUsers: [],
  messageEvents: [],
  dareRequests: [],
  dareResponses: [],
  onlineFriends: [],
  realTimeSubscriptions: new Map(),
  frozenBy: null,
  seenMessages: [], // Track seen messages for ignored logic
  friendDraft: null, // Live draft text from the other user

  // Computed values
  get unreadCount() {
    return get().conversations.reduce(
      (total, conv) => total + (conv.unread_count || 0),
      0,
    );
  },

  get hasActiveConversation() {
    return !!get().currentConversation;
  },

  get isTyping() {
    const { currentConversation, typingUsers } = get();
    return typingUsers.some(
      (user) => user.user_id !== currentConversation?.other_user?.user_id,
    );
  },

  get isConversationFrozen() {
    return !!get().frozenBy;
  },

  // Actions
  loadConversations: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      const conversations =
        await messagingService.getConversationsForUser(userId);

      // Remove duplicates based on other_user.user_id
      const uniqueConversations = conversations.filter(
        (conv, index, self) =>
          index ===
          self.findIndex(
            (c) => c.other_user?.user_id === conv.other_user?.user_id,
          ),
      );

      const transformedConversations = uniqueConversations.map((conv: any) => ({
        id: conv.id,
        other_user: conv.other_user,
        last_message_content: conv.last_message?.content || "",
        last_message_at: conv.last_message?.created_at || conv.updated_at,
        unread_count: conv.unread_count || 0,
        is_online: conv.is_online || false,
        is_typing: conv.is_typing || false,
        typing_speed: conv.typing_speed,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
      }));

      set({ conversations: transformedConversations, loading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load conversations";
      set({ loading: false, error: errorMessage });
    }
  },

  getOrCreateConversation: async (userId1: string, userId2: string) => {
    try {
      const conversation = await messagingService.getOrCreateConversation(
        userId1,
        userId2,
      );
      return conversation.id;
    } catch (error) {
      console.error("Error getting or creating conversation:", error);
      throw error;
    }
  },

  loadMessages: async (conversationId: string, userId: string) => {
    set({ loadingMessages: true, error: null });
    try {
      const messages = await messagingService.getMessages(conversationId);
      const transformedMessages = messages.map((msg: any) =>
        normalizeMessage(msg, userId),
      );
      set({ messages: transformedMessages, loadingMessages: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load messages";
      set({ loadingMessages: false, error: errorMessage });
    }
  },

  sendMessage: async (request: CreateMessageRequest) => {
    set({ sendingMessage: true, error: null });
    try {
      await messagingService.sendMessage({
        ...request,
        media_type: request.media_type as
          | "TEXT"
          | "PHOTO"
          | "VIDEO"
          | undefined,
      });
      set({ sendingMessage: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";
      set({ sendingMessage: false, error: errorMessage });
    }
  },

  markMessagesAsSeen: async (conversationId: string, _userId: string) => {
    try {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.conversation_id === conversationId
            ? { ...msg, is_seen: true, is_delivered: true }
            : msg,
        ),
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId ? { ...conv, unread_count: 0 } : conv,
        ),
      }));
    } catch (error) {
      console.error("Error marking messages as seen:", error);
    }
  },

  respondToRandomChatDare: async (
    conversationIdOrUserId: string,
    userIdOrDareId: string,
    acceptOrResponse: boolean | string,
  ) => {
    try {
      console.log(
        `Random chat dare response: ${acceptOrResponse} — ${conversationIdOrUserId} / ${userIdOrDareId}`,
      );
    } catch (error) {
      console.error("Error responding to random chat dare:", error);
    }
  },

  subscribeToConversation: (
    conversationId: string,
    _callback: (payload: any) => void,
  ) => {
    console.log(`Subscribed to conversation ${conversationId}`);
  },

  unsubscribeFromConversation: (conversationId: string) => {
    console.log(`Unsubscribed from conversation ${conversationId}`);
  },

  clearCurrentConversation: () => {
    set({ currentConversation: null, messages: [] });
  },

  setCurrentConversation: (conversation: ConversationWithUser | null) => {
    set({ currentConversation: conversation });
  },

  clearError: () => {
    set({ error: null });
  },

  // Event tracking methods
  trackScreenshot: async (conversationId: string, messageId?: string) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) return;

      await messagingService.trackScreenshot(
        conversationId,
        user.id,
        messageId,
      );
    } catch (error) {
      console.error("Error tracking screenshot:", error);
    }
  },

  trackChatSwitch: async (
    conversationId: string,
    targetUserName: string,
    targetUserId: string,
    recipientUserId?: string,
  ) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) return;

      await messagingService.trackChatSwitch(
        conversationId,
        user.id,
        targetUserName,
        targetUserId,
        recipientUserId,
      );
    } catch (error) {
      console.error("Error tracking chat switch:", error);
    }
  },

  trackOpenedNoReply: async (conversationId: string) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) return;

      await messagingService.trackOpenedNoReply(conversationId, user.id);
    } catch (error) {
      console.error("Error tracking opened no reply:", error);
    }
  },

  trackLongUnsent: async (conversationId: string, content: string) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) return;

      await messagingService.trackLongUnsent(conversationId, user.id, content);
    } catch (error) {
      console.error("Error tracking long unsent:", error);
    }
  },

  trackMention: async (conversationId: string, mentionedUsername: string) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) return;

      // Write to Firestore — onSnapshot delivers to BOTH users in real time
      await messagingService.trackMention(
        conversationId,
        user.id,
        mentionedUsername,
      );

      // Create SUS_MENTION_TALKING alert for the mentioned third-party user
      const conv = get().currentConversation;
      const otherUser = conv?.other_user;

      // Resolve the other user's username — try multiple fields
      const otherUsername =
        otherUser?.username || otherUser?.display_name || "someone";
      const otherUserId = otherUser?.user_id || otherUser?.id || "";

      // Always attempt to create the sus alert — the surveillance service
      // will look up the mentioned user by username in Firestore
      surveillanceService
        .trackMentionTalking({
          mentionedUsername,
          senderUserId: user.id,
          senderUsername: user.username || "someone",
          senderDisplayName: user.displayName || user.username || "Someone",
          otherUserId,
          otherUsername,
          conversationId,
        })
        .catch((err) => {
          console.error("[@mention store] Surveillance error:", err);
        });
    } catch (error) {
      console.error("[@mention store] Error:", error);
    }
  },

  trackIgnoredMessage: async (
    conversationId: string,
    targetUserName: string,
  ) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) return;

      console.log(
        "[@ignored store] Writing ignored to Firestore:",
        conversationId,
        targetUserName,
      );
      await messagingService.trackIgnoredMessage(
        conversationId,
        user.id,
        targetUserName, // the friend's name (who sent the ignored msg)
        targetUserName, // fix: pass target name, not user's own name
      );
      console.log("[@ignored store] Ignored write complete");
    } catch (error) {
      console.error("[@ignored store] Error:", error);
    }
  },

  trackSeenMessage: (
    messageId: string,
    conversationId: string,
    senderId: string,
    senderName: string,
  ) => {
    // Already fired ignored for this exact message
    if (ignoredMessages.has(messageId)) return;
    // Already have an active timer for this conversation
    if (ignoredTimers.has(conversationId)) return;
    // Already fired the ignored event for this conversation
    if (ignoredConversations.has(conversationId)) return;

    ignoredMessages.add(messageId); // mark so re-renders don't re-arm

    const { seenMessages } = get();
    const now = Date.now();

    const seenMessage: SeenMessage = {
      messageId,
      conversationId,
      seenAt: now,
      senderId,
      senderName,
    };

    console.log("[@ignored] Tracking seen message:", seenMessage);
    set({
      seenMessages: [
        ...seenMessages.filter((m) => m.conversationId !== conversationId),
        seenMessage,
      ],
    });

    const existingTimer = ignoredTimers.get(conversationId);
    if (existingTimer) clearTimeout(existingTimer);

    // Start 5-minute timer to check if reply comes
    const timer = setTimeout(
      () => {
        get().checkIgnoredMessage(
          messageId,
          conversationId,
          senderId,
          senderName,
        );
      },
      5 * 60 * 1000,
    ); // 5 minutes
    ignoredTimers.set(conversationId, timer);
  },

  checkIgnoredMessage: (
    messageId: string,
    conversationId: string,
    senderId: string,
    senderName: string,
  ) => {
    const { seenMessages, messages } = get();
    const seenMessage = seenMessages.find((m) => m.messageId === messageId);

    if (!seenMessage) return;

    const timer = ignoredTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      ignoredTimers.delete(conversationId);
    }

    // Check if we've already triggered an ignored event for this conversation
    if (ignoredConversations.has(conversationId)) {
      console.log(
        "[@ignored] Already triggered ignored event for conversation:",
        conversationId,
      );
      return;
    }

    const currentUserId = useAuthStore.getState().user?.id;

    // Check if there's a reply after the message was seen
    const hasReply = messages.some(
      (msg) =>
        msg.senderId === currentUserId &&
        new Date(msg.timestamp).getTime() > seenMessage.seenAt,
    );

    if (!hasReply) {
      console.log("[@ignored] Message ignored, triggering event:", senderName);
      // Mark this conversation as having triggered an ignored event
      ignoredConversations.add(conversationId);
      get().trackIgnoredMessage(conversationId, senderName);

      // Remove from seenMessages to prevent re-checking
      const updatedSeenMessages = seenMessages.filter(
        (m) => m.conversationId !== conversationId,
      );
      set({ seenMessages: updatedSeenMessages });
      return;
    }

    // Replied in time: clear pending seen-tracking for this conversation
    set((state) => ({
      seenMessages: state.seenMessages.filter(
        (m) => m.conversationId !== conversationId,
      ),
    }));
  },

  clearIgnoredTracking: (conversationId: string) => {
    const timer = ignoredTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      ignoredTimers.delete(conversationId);
    }

    // Clear message-level dedup for this conversation so a new
    // conversation session starts fresh (but DON'T touch ignoredConversations)
    const { seenMessages } = get();
    seenMessages
      .filter((m) => m.conversationId === conversationId)
      .forEach((m) => ignoredMessages.delete(m.messageId));

    ignoredConversations.delete(conversationId); // OK here â this is a full chat switch
    set((state) => ({
      seenMessages: state.seenMessages.filter(
        (m) => m.conversationId !== conversationId,
      ),
    }));
  },

  // Legacy methods (keep for compatibility)
  trackScreenshotLegacy: async (messageId: string, userId: string) => {
    try {
      set((state) => ({
        messageEvents: [
          ...state.messageEvents,
          {
            id: `event-${Date.now()}`,
            message_id: messageId,
            conversation_id: "", // Legacy events don't have conversation_id
            user_id: userId,
            event_type: "screenshot",
            created_at: new Date().toISOString(),
          },
        ],
      }));
    } catch (error) {
      console.error("Error tracking screenshot (legacy):", error);
    }
  },

  trackAlmostSent: async (
    conversationId: string,
    userId: string,
    content: string,
  ) => {
    try {
      // Map legacy ALMOST_SENT to long_unsent event
      await messagingService.trackLongUnsent(conversationId, userId, content);
    } catch (error) {
      console.error("Error tracking almost sent:", error);
    }
  },

  startTyping: async (
    conversationId: string,
    userId: string,
    speed: "slow" | "medium" | "fast",
  ) => {
    try {
      set((state) => ({
        typingUsers: [
          ...state.typingUsers.filter((u) => u.user_id !== userId),
          {
            conversation_id: conversationId,
            user_id: userId,
            is_typing: true,
            speed,
            started_at: new Date().toISOString(),
          },
        ],
      }));
    } catch (error) {
      console.error("Error starting typing:", error);
    }
  },

  stopTyping: async (conversationId: string, userId: string) => {
    try {
      set((state) => ({
        typingUsers: state.typingUsers.filter(
          (u) =>
            !(u.conversation_id === conversationId && u.user_id === userId),
        ),
      }));
    } catch (error) {
      console.error("Error stopping typing:", error);
    }
  },

  freezeConversation: async (conversationId: string, userId: string) => {
    try {
      messagingService.freezeChat(conversationId, userId);
    } catch (error) {
      console.error("Error freezing conversation:", error);
    }
  },

  unfreezeConversation: async (conversationId: string, userId: string) => {
    try {
      messagingService.unfreezeChat(conversationId, userId);
    } catch (error) {
      console.error("Error unfreezing conversation:", error);
    }
  },

  deleteMessage: async (messageId: string, _userId: string) => {
    try {
      set((state) => ({
        messages: state.messages.filter((msg) => msg.id !== messageId),
      }));
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  },

  initiateRandomChatDare: async (userId: string, friendId: string) => {
    try {
      console.log(`Random chat dare initiated by ${userId} to ${friendId}`);
    } catch (error) {
      console.error("Error initiating random chat dare:", error);
    }
  },

  loadOlderMessages: async () => {
    const { messages, currentConversation, loadingOlderMessages } = get();
    if (loadingOlderMessages || !currentConversation?.id || !messages.length)
      return;

    set({ loadingOlderMessages: true });
    try {
      const oldestCreatedAt = (messages[0] as any)?.created_at;
      if (!oldestCreatedAt) return;

      const older = await messagingService.getOlderMessages(
        currentConversation.id,
        oldestCreatedAt,
      );
      if (older.length === 0) {
        set({ hasMoreMessages: false });
        return;
      }

      const currentUserId = useAuthStore.getState().user?.id ?? "";
      const normalized = older.map((msg: any) =>
        normalizeMessage(msg, currentUserId),
      );
      set((state) => ({
        messages: [...normalized, ...state.messages],
        hasMoreMessages: older.length === 50,
      }));
    } catch (error) {
      console.error("❌ loadOlderMessages:", error);
    } finally {
      set({ loadingOlderMessages: false });
    }
  },

  // REAL-TIME METHODS
  subscribeToRealTimeConversations: (userId: string) => {
    // Cancel any existing subscription first so we never have two listeners
    const existingSub = get().realTimeSubscriptions.get("conversations");
    if (existingSub) existingSub();

    // Side subscriptions managed within the closure so they are always
    // cleaned up together with the main Firestore listener.
    let participantUnsub: (() => void) | null = null;
    let typingUnsub: (() => void) | null = null;

    const unsubscribe = messagingService.subscribeToConversations(
      userId,
      (incoming) => {
        // Deduplicate by conversation id at the store level as a safety net
        const seen = new Set<string>();
        const deduped = incoming.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });

        // Use onlineFriends + typingUsers from store as the single source of
        // truth — avoids rebuilding the conversation list wiping those flags.
        const { onlineFriends, typingUsers } = get();
        const currentUserId = useAuthStore.getState().user?.id ?? "";
        const merged = deduped.map((conv) => {
          const otherUserId =
            conv.other_user?.user_id || conv.other_user?.id || "";
          const isTyping = typingUsers.some(
            (t) =>
              t.conversation_id === conv.id &&
              t.user_id !== currentUserId &&
              t.is_typing,
          );
          return {
            ...conv,
            is_online: onlineFriends.includes(otherUserId),
            is_typing: isTyping,
          };
        });

        set({ conversations: merged, loading: false });

        // ── RTDB: per-participant online status ───────────────────────────
        // Covers conversation partners who aren't in the formal friends list.
        if (participantUnsub) participantUnsub();
        const participantIds = [
          ...new Set(
            deduped
              .map((c) => c.other_user?.user_id || c.other_user?.id)
              .filter(Boolean) as string[],
          ),
        ];
        participantUnsub = messagingService.subscribeToUsersOnlineStatus(
          participantIds,
          (onlineIds) => {
            set((state) => ({
              onlineFriends: onlineIds,
              conversations: state.conversations.map((conv) => ({
                ...conv,
                is_online: onlineIds.includes(
                  conv.other_user?.user_id || conv.other_user?.id || "",
                ),
              })),
            }));
          },
        );

        // ── RTDB: per-conversation typing channels ────────────────────────
        // Allows the chat list to show live typing indicators without the
        // user needing to have a conversation open.
        if (typingUnsub) typingUnsub();
        typingUnsub = messagingService.subscribeToConversationsTyping(
          deduped.map((c) => c.id),
          currentUserId,
          (typingByConvId) => {
            set((state) => ({
              conversations: state.conversations.map((conv) => ({
                ...conv,
                is_typing: typingByConvId.get(conv.id) ?? conv.is_typing,
              })),
            }));
          },
        );
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("conversations", () => {
      unsubscribe();
      if (participantUnsub) participantUnsub();
      if (typingUnsub) typingUnsub();
    });
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromRealTimeConversations: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("conversations");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("conversations");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  subscribeToRealTimeMessages: (conversationId: string) => {
    console.log(`📦 Store: subscribeToRealTimeMessages for ${conversationId}`);

    // Cancel any existing message subscription before creating a new one
    const existingSub = get().realTimeSubscriptions.get("messages");
    if (existingSub) {
      console.log(`📦 Store: Cancelling existing message subscription`);
      existingSub();
    }

    const unsubscribe = messagingService.subscribeToMessages(
      conversationId,
      (messages) => {
        console.log(
          `📦 Store: Received ${messages.length} messages from service for ${conversationId}`,
        );
        const currentUserId = useAuthStore.getState().user?.id ?? "";
        const normalized = messages.map((msg: any) =>
          normalizeMessage(msg, currentUserId),
        );
        // Service fetches DESC + limit(50) then reverses, so result is asc order.
        // Set directly — assume more history exists if we received a full page.
        console.log(`📦 Store: Setting ${normalized.length} messages in state`);
        set({
          messages: normalized,
          loadingMessages: false,
          hasMoreMessages: normalized.length >= 50,
        });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("messages", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
    console.log(`📦 Store: Subscription stored for ${conversationId}`);
  },

  unsubscribeFromRealTimeMessages: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("messages");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("messages");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  sendRealTimeMessage: async (
    conversationId: string,
    content: string,
    mediaUrl?: string,
    mediaType?: "TEXT" | "PHOTO" | "VIDEO",
  ) => {
    const { user } = useAuthStore.getState();
    if (!user?.id) throw new Error("User not authenticated");

    set({ sendingMessage: true });

    try {
      // Check if current user (sender) is in ghost mode
      const shouldSuppress = await ghostModeService.shouldSuppressAlerts(
        user.id,
      );
      if (shouldSuppress) {
        console.log(
          `Ghost mode active for sender ${user.id} - message will not trigger surveillance alerts`,
        );
        // Still deliver the message, but don't trigger surveillance
      }

      // Pass recipientId from cached state — avoids a getDoc(conversation) on every send
      const recipientId =
        get().currentConversation?.other_user?.user_id ??
        get().currentConversation?.other_user?.id;
      await messagingService.sendMessageWithDelivery(
        conversationId,
        user.id,
        content,
        mediaUrl,
        mediaType,
        recipientId,
      );
      // onSnapshot fires automatically and updates messages state —
      // no manual state update needed here.
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    } finally {
      set({ sendingMessage: false });
    }
  },

  markMessageAsSeen: async (messageId: string) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error("User not authenticated");

      // Pass conversationId from cached state — avoids a getDoc(message) re-read
      const conversationId = get().currentConversation?.id;
      await messagingService.markMessageAsSeen(
        messageId,
        user.id,
        conversationId,
      );

      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === messageId ? { ...msg, is_seen: true } : msg,
        ),
      }));
    } catch (error) {
      console.error("❌ Error marking message as seen:", error);
    }
  },

  setTypingIndicator: (
    conversationId: string,
    isTyping: boolean,
    speed?: "slow" | "normal" | "fast" | "furious",
  ) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) return;

      messagingService.setTypingIndicator(
        conversationId,
        user.id,
        isTyping,
        speed,
      );

      if (isTyping) {
        const typingUsers = get().typingUsers.filter(
          (u) =>
            !(u.conversation_id === conversationId && u.user_id === user.id),
        );
        typingUsers.push({
          conversation_id: conversationId,
          user_id: user.id,
          is_typing: true,
          speed: speed || "normal",
          started_at: new Date().toISOString(),
        });
        set({ typingUsers });
      } else {
        set({
          typingUsers: get().typingUsers.filter(
            (u) =>
              !(u.conversation_id === conversationId && u.user_id === user.id),
          ),
        });
      }
    } catch (error) {
      console.error("❌ Error setting typing indicator:", error);
    }
  },

  subscribeToOnlineStatus: (userId: string) => {
    const unsubscribe = messagingService.subscribeToFriendsOnlineStatus(
      userId,
      (onlineFriends) => {
        console.log(`🟢 Online status update:`, onlineFriends);

        // Update conversations with online status
        const { conversations } = get();
        const updatedConversations = conversations.map((conv) => {
          const isOnline = onlineFriends.includes(
            conv.other_user?.user_id || conv.other_user?.id || "",
          );
          if (conv.is_online !== isOnline) {
            console.log(
              `🟢 ${conv.other_user?.username} is now ${isOnline ? "online" : "offline"}`,
            );
          }
          return {
            ...conv,
            is_online: isOnline,
          };
        });
        set({
          onlineFriends,
          conversations: updatedConversations,
        });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("onlineStatus", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromOnlineStatus: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("onlineStatus");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("onlineStatus");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  setOnlineStatus: (isOnline: boolean) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) return;
      messagingService.setOnlineStatus(user.id, isOnline);
    } catch (error) {
      console.error("❌ Error setting online status:", error);
    }
  },

  subscribeToRealTimeEvents: (conversationId: string) => {
    // Cancel any existing event subscription first
    const existingSub = get().realTimeSubscriptions.get("events");
    if (existingSub) existingSub();

    const unsubscribe = messagingService.subscribeToEvents(
      conversationId,
      (events) => {
        const mentionEvents = events.filter((e) => e.event_type === "mention");
        if (mentionEvents.length > 0) {
          console.log(
            "[@mention store] Received events, mentions:",
            mentionEvents.length,
            mentionEvents,
          );
          console.log(
            "[@mention store] Total messageEvents now:",
            events.length,
          );
        }
        set({ events, messageEvents: events });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("events", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromRealTimeEvents: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("events");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("events");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  // ── Typing indicators subscription (listen for OTHER users typing) ──
  subscribeToTypingIndicators: (conversationId: string) => {
    const existingSub = get().realTimeSubscriptions.get("typingIndicators");
    if (existingSub) existingSub();

    const { user } = useAuthStore.getState();
    if (!user?.id) return;

    const unsubscribe = messagingService.subscribeToTypingIndicators(
      conversationId,
      user.id,
      (typingUsers) => {
        console.log(`📝 Typing update for ${conversationId}:`, typingUsers);

        // Update the conversation's typing status
        const { conversations } = get();
        const updatedConversations = conversations.map((conv) => {
          if (conv.id === conversationId) {
            const otherUserTyping = typingUsers.some(
              (t) => t.user_id !== user.id && t.is_typing,
            );
            console.log(
              `📝 Setting typing for ${conv.other_user?.username}: ${otherUserTyping}`,
            );
            return { ...conv, is_typing: otherUserTyping };
          }
          return conv;
        });

        // Merge remote typing users with conversation id
        const remoteTyping = typingUsers.map((t) => ({
          conversation_id: conversationId,
          user_id: t.user_id,
          is_typing: t.is_typing,
          speed: t.typing_speed,
          started_at: new Date().toISOString(),
        }));
        // Keep own typing state, replace remote
        const ownTyping = get().typingUsers.filter(
          (u) => u.user_id === user.id,
        );
        set({
          conversations: updatedConversations,
          typingUsers: [...ownTyping, ...remoteTyping],
        });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("typingIndicators", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromTypingIndicators: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("typingIndicators");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("typingIndicators");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  // ── Freeze chat ──
  freezeChat: (conversationId: string) => {
    const { user } = useAuthStore.getState();
    if (!user?.id) return;
    messagingService.freezeChat(conversationId, user.id);
  },

  unfreezeChat: (conversationId: string) => {
    const { user } = useAuthStore.getState();
    if (!user?.id) return;
    messagingService.unfreezeChat(conversationId, user.id);
  },

  subscribeToFreezeStatus: (conversationId: string) => {
    const existingSub = get().realTimeSubscriptions.get("freezeStatus");
    if (existingSub) existingSub();

    const unsubscribe = messagingService.subscribeToFreezeStatus(
      conversationId,
      ({ is_frozen, frozen_by }) => {
        set({ frozenBy: is_frozen ? frozen_by : null });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("freezeStatus", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromFreezeStatus: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("freezeStatus");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("freezeStatus");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  // ── Live draft text (letter-by-letter preview) ──────────────────────────

  setDraftText: (conversationId: string, text: string) => {
    const { user } = useAuthStore.getState();
    console.log(
      "[draft store] setDraftText user:",
      user?.id,
      "conv:",
      conversationId,
      "text:",
      text,
    );
    if (!user?.id) return;
    messagingService.setDraftText(conversationId, user.id, text);
  },

  clearDraftText: (conversationId: string) => {
    const { user } = useAuthStore.getState();
    if (!user?.id) return;
    messagingService.clearDraftText(conversationId, user.id);
  },

  subscribeToDraftText: (conversationId: string) => {
    const existingSub = get().realTimeSubscriptions.get("draft");
    if (existingSub) existingSub();

    const { user } = useAuthStore.getState();
    console.log(
      "[draft store] subscribeToDraftText user:",
      user?.id,
      "conv:",
      conversationId,
    );
    if (!user?.id) return;

    const unsubscribe = messagingService.subscribeToDraftText(
      conversationId,
      user.id,
      (draft) => {
        console.log("[draft store] Received draft from friend:", draft);
        set({ friendDraft: draft?.text ?? null });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("draft", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromDraftText: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("draft");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("draft");
      set({ realTimeSubscriptions: subscriptions, friendDraft: null });
    }
  },
}));
