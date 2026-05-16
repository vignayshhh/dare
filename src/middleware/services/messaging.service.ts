import { auth, db, realtimeDb } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  Timestamp,
  increment,
  documentId,
} from "firebase/firestore";
import {
  ref,
  onValue,
  get,
  set,
  onDisconnect,
  push,
  serverTimestamp as rtdbServerTimestamp,
} from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { friendsService } from "./friends.service";
import { ghostModeService } from "./ghost-mode.service";
import {
  getCachedResolvedUserProfile,
  primeResolvedUserProfile,
  resolveUserProfile,
} from "@/utils/profileResolver";
import { validateRequiredText, SECURITY_LIMITS } from "@/security/appSecurity";
import { logFirestoreError } from "@/utils/firestoreErrors";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url?: string;
  media_type?: "TEXT" | "PHOTO" | "VIDEO";
  created_at: string;
  updated_at: string;
  is_delivered: boolean;
  is_seen: boolean;
  reply_to?: {
    id: string;
    sender_id: string;
    sender_name: string;
    content: string;
    media_type?: "TEXT" | "PHOTO" | "VIDEO" | string | null;
  } | null;
}

export interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  last_message_content?: string;
  unread_count_by_user?: Record<string, number>;
  cleared_at?: string | null;
  cleared_at_by_user?: Record<string, string | null>;
  temporary_participant_ids?: string[];
}

export interface MessageEvent {
  id: string;
  conversation_id: string;
  user_id: string;
  event_type:
    | "message_sent"
    | "message_seen"
    | "message_delivered"
    | "typing_started"
    | "typing_stopped"
    | "screenshot"
    | "chat_switch"
    | "opened_noreply"
    | "long_unsent"
    | "mention"
    | "ignored"
    | "invite";
  data?: any;
  participants?: string[];
  created_at: string;
}

export interface TypingIndicator {
  id: string;
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  is_online?: boolean;
  typing_speed?: "slow" | "normal" | "fast" | "furious";
  last_seen: string;
}

export interface UserPresenceStatus {
  userId: string;
  isOnline: boolean;
  lastSeen: string | number | null;
  timezone: string;
  typingConversationId?: string | null;
  typingSpeed?: string;
}

function getClientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function presenceTimeToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as { toMillis?: () => number }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds?: number }).seconds === "number"
  ) {
    return (value as { seconds: number }).seconds * 1000;
  }
  return null;
}

function isRecentPresenceTime(value: unknown, windowMs = 90000): boolean {
  const millis = presenceTimeToMillis(value);
  return millis !== null && Date.now() - millis >= 0 && Date.now() - millis <= windowMs;
}

const MESSAGING_DEBUG = true;

function messagingDebug(label: string, details: Record<string, unknown> = {}) {
  if (!MESSAGING_DEBUG) return;
  console.log(`[MessagingDebug] ${label}`, {
    at: new Date().toISOString(),
    authUid: auth.currentUser?.uid ?? null,
    ...details,
  });
}

export interface CreateMessageRequest {
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url?: string;
  media_type?: string;
}

export interface MessageWithSender extends Omit<
  Message,
  "is_delivered" | "is_seen"
> {
  sender: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface ConversationWithUser extends Conversation {
  other_user: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  last_message?: MessageWithSender | undefined;
  unread_count?: number;
  is_online?: boolean;
  is_typing?: boolean;
  typing_speed?: "slow" | "normal" | "fast" | "furious";
  events?: MessageEvent[];
}

export interface MessageEventDetail {
  conversation_id: string;
  event: MessageEvent;
  message?: MessageWithSender;
}

export interface ChatSwitchSignal {
  id: string;
  conversation_id: string;
  user_id: string;
  target_user_id: string;
  target_user_name: string;
  recipient_user_id?: string;
  created_at: number;
}

// Minimal sender stub — ensures a message is never dropped due to a failed
// or slow profile fetch.
function fallbackSender(userId: string) {
  return {
    id: userId,
    user_id: userId,
    username: `user_${userId.slice(-6)}`,
    display_name: null,
    avatar_url: null,
  };
}

class MessagingService {
  // In-memory profile cache to avoid repeated Firestore reads for the same
  // user. Entries expire after 5 minutes.
  private profileCache = new Map<string, any>();
  private onlineStatusWriteVersion = new Map<string, number>();

  private async waitForRealtimeAuth(
    userId: string,
    timeoutMs = 10000,
  ): Promise<boolean> {
    if (!auth) return false;
    if (auth.currentUser?.uid === userId) return true;

    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe: (() => void) | null = null;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        if (unsubscribe) unsubscribe();
        clearTimeout(timeout);
        resolve(ready);
      };
      const timeout = setTimeout(() => finish(false), timeoutMs);

      try {
        // IMPORTANT: only resolve when auth becomes the expected user. Resolving
        // on the initial null fire (which happens on page reload before Firebase
        // Auth has restored the cached session) would cause presence/typing
        // writes to be silently skipped, leaving the user appearing offline.
        unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          if (firebaseUser?.uid === userId) {
            finish(true);
          }
        });
      } catch {
        finish(false);
      }
    });
  }

  private async waitForAnyRealtimeAuth(timeoutMs = 10000): Promise<boolean> {
    if (!auth) return false;
    if (auth.currentUser) return true;
    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe: (() => void) | null = null;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        if (unsubscribe) unsubscribe();
        clearTimeout(timeout);
        resolve(ready);
      };
      const timeout = setTimeout(() => finish(false), timeoutMs);
      try {
        unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          if (firebaseUser) finish(true);
        });
      } catch {
        finish(false);
      }
    });
  }

  private async isGhostModeActive(userId: string): Promise<boolean> {
    try {
      return await ghostModeService.shouldSuppressAlerts(userId);
    } catch (error) {
      console.error("❌ isGhostModeActive:", error);
      return false;
    }
  }

  private async getCachedUserProfile(userId: string): Promise<any> {
    const sharedCachedProfile = getCachedResolvedUserProfile(userId);
    if (sharedCachedProfile) {
      this.profileCache.set(userId, sharedCachedProfile);
      return sharedCachedProfile;
    }

    if (this.profileCache.has(userId)) {
      return this.profileCache.get(userId);
    }
    const profile = await resolveUserProfile(userId);
    if (profile) {
      this.profileCache.set(userId, profile);
      setTimeout(() => this.profileCache.delete(userId), 5 * 60 * 1000);
    }
    return profile;
  }

  private getOriginalParticipantIds(
    conversationData: Partial<Conversation> | null,
  ): string[] {
    if (!conversationData) return [];
    return [conversationData.user1_id, conversationData.user2_id].filter(
      (id): id is string => !!id,
    );
  }

  private getAllConversationParticipantIds(
    conversationData: Partial<Conversation> | null,
  ): string[] {
    return [
      ...this.getOriginalParticipantIds(conversationData),
      ...(conversationData?.temporary_participant_ids || []).filter(Boolean),
    ].filter((id, index, self) => self.indexOf(id) === index);
  }

  private async getActiveParticipantIdsForConversation(
    conversationId: string,
  ): Promise<string[]> {
    const conversationSnap = await getDoc(
      doc(db, "conversations", conversationId),
    );
    const conversationData = conversationSnap.exists()
      ? (conversationSnap.data() as Conversation)
      : null;
    return this.getAllConversationParticipantIds(conversationData);
  }

  // ── Conversations ──────────────────────────────────────────────────────────

  async getOrCreateConversation(
    user1Id: string,
    user2Id: string,
  ): Promise<Conversation> {
    try {
      const existing = await this.getConversationBetweenUsers(user1Id, user2Id);
      if (existing) return existing;
      return await this.createConversation(user1Id, user2Id);
    } catch (error) {
      console.error("❌ getOrCreateConversation:", error);
      throw error;
    }
  }

  async getConversationBetweenUsers(
    user1Id: string,
    user2Id: string,
  ): Promise<Conversation | null> {
    try {
      // Check both orderings: (A,B) and (B,A)
      const [snap1, snap2] = await Promise.all([
        getDocs(
          query(
            collection(db, "conversations"),
            where("user1_id", "==", user1Id),
            where("user2_id", "==", user2Id),
          ),
        ),
        getDocs(
          query(
            collection(db, "conversations"),
            where("user1_id", "==", user2Id),
            where("user2_id", "==", user1Id),
          ),
        ),
      ]);
      const docs = [...snap1.docs, ...snap2.docs];
      if (docs.length > 0) {
        const d = docs[0];
        return { id: d.id, ...d.data() } as Conversation;
      }
      return null;
    } catch (error) {
      logFirestoreError("getConversationBetweenUsers failed:", error);
      return null;
    }
  }

  async createConversation(
    user1Id: string,
    user2Id: string,
  ): Promise<Conversation> {
    try {
      const areFriends = await friendsService.areFriends(user1Id, user2Id);
      if (!areFriends)
        throw new Error("Users must be friends to create a conversation");
      const conversationRef = doc(collection(db, "conversations"));
      const data = {
        user1_id: user1Id,
        user2_id: user2Id,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        unread_count_by_user: {
          [user1Id]: 0,
          [user2Id]: 0,
        },
      };
      await setDoc(conversationRef, data);
      return { id: conversationRef.id, ...data } as unknown as Conversation;
    } catch (error) {
      console.error("❌ createConversation:", error);
      throw error;
    }
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    try {
      const snap = await getDoc(doc(db, "conversations", conversationId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Conversation;
    } catch (error) {
      logFirestoreError("getConversation failed:", error);
      return null;
    }
  }

  async getConversationWithUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationWithUser | null> {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) return null;

      const otherUserId =
        conversation.user1_id === userId
          ? conversation.user2_id
          : conversation.user1_id;

      const otherUser =
        (await this.getCachedUserProfile(otherUserId)) ??
        fallbackSender(otherUserId);

      const [lastMessage, unreadCount] = await Promise.all([
        this.getLastMessage(conversationId),
        this.getConversationUnreadCount(conversation, userId),
      ]);
      const effectiveClearedAt =
        conversation.cleared_at_by_user?.[userId] ??
        conversation.cleared_at ??
        null;
      const lastMessageVisible =
        !effectiveClearedAt ||
        !lastMessage ||
        this.toMillis(lastMessage.created_at) >
          this.toMillis(effectiveClearedAt);

      let typingStatus = null;
      try {
        typingStatus = await this.getTypingStatus(conversationId, otherUserId);
      } catch {
        // non-fatal
      }

      return {
        ...conversation,
        cleared_at: effectiveClearedAt,
        temporary_participant_ids: conversation.temporary_participant_ids || [],
        other_user: {
          id: otherUser.id,
          user_id: otherUser.user_id || otherUser.id,
          username: otherUser.username,
          display_name: otherUser.display_name,
          avatar_url: otherUser.avatar_url,
        },
        last_message: lastMessageVisible ? lastMessage : undefined,
        unread_count: lastMessageVisible ? unreadCount : 0,
        is_online: typingStatus?.is_online || false,
        is_typing: typingStatus?.is_typing || false,
        typing_speed: typingStatus?.typing_speed,
      };
    } catch (error) {
      logFirestoreError("getConversationWithUser failed:", error);
      return null;
    }
  }

  async getConversationsForUser(
    userId: string,
  ): Promise<ConversationWithUser[]> {
    try {
      const [snap1, snap2] = await Promise.all([
        getDocs(
          query(
            collection(db, "conversations"),
            where("user1_id", "==", userId),
          ),
        ),
        getDocs(
          query(
            collection(db, "conversations"),
            where("user2_id", "==", userId),
          ),
        ),
      ]);

      const seen = new Set<string>();
      const results: ConversationWithUser[] = [];

      for (const d of [...snap1.docs, ...snap2.docs]) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const cwu = await this.getConversationWithUser(d.id, userId);
        if (cwu) results.push(cwu);
      }

      return results;
    } catch (error) {
      logFirestoreError("getConversationsForUser failed:", error);
      return [];
    }
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async sendMessage(request: CreateMessageRequest): Promise<Message> {
    try {
      // SECURITY: Validate message content client-side before sending to Firestore
      const validatedContent = validateRequiredText(
        request.content,
        "message content",
        SECURITY_LIMITS.postContent,
      );

      const conversationSnap = await getDoc(
        doc(db, "conversations", request.conversation_id),
      );
      const conversationData = conversationSnap.exists()
        ? (conversationSnap.data() as Conversation)
        : null;
      const recipientId =
        conversationData?.user1_id === request.sender_id
          ? conversationData.user2_id
          : conversationData?.user1_id;

      // Stamp participants so Firestore rules can gate message reads on
      // `auth.uid in resource.data.participants` without a cross-doc get().
      const participants =
        this.getAllConversationParticipantIds(conversationData);

      const messageRef = doc(collection(db, "messages"));
      const data = {
        conversation_id: request.conversation_id,
        sender_id: request.sender_id,
        participants,
        content: validatedContent,
        media_url: request.media_url,
        media_type: request.media_type || "TEXT",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        is_delivered: false,
        is_seen: false,
      };
      await setDoc(messageRef, data);
      const conversationUpdates: Record<string, any> = {
        updated_at: serverTimestamp(),
        last_message_at: serverTimestamp(),
        last_message_content: validatedContent,
        [`unread_count_by_user.${request.sender_id}`]: 0,
      };
      if (recipientId) {
        conversationUpdates[`unread_count_by_user.${recipientId}`] =
          increment(1);
      }
      await updateDoc(
        doc(db, "conversations", request.conversation_id),
        conversationUpdates,
      );
      return { id: messageRef.id, ...data } as unknown as Message;
    } catch (error) {
      console.error("❌ sendMessage:", error);
      throw error;
    }
  }

  async sendMessageWithDelivery(
    conversationId: string,
    senderId: string,
    content: string,
    mediaUrl?: string,
    mediaType?: "TEXT" | "PHOTO" | "VIDEO",
    recipientId?: string,
    replyTo?: Message["reply_to"],
    participantIds?: string[],
  ): Promise<MessageWithSender> {
    try {
      // SECURITY: Validate message content client-side before sending to Firestore
      const validatedContent = validateRequiredText(
        content,
        "message content",
        SECURITY_LIMITS.postContent,
      );

      // recipientId passed by the caller avoids a getDoc(conversation) on every
      // send. Fall back to fetching the conversation only when not provided.
      let resolvedRecipientId = recipientId;
      let conversationData: Conversation | null = null;
      if (!resolvedRecipientId) {
        const conversationSnap = await getDoc(
          doc(db, "conversations", conversationId),
        );
        conversationData = conversationSnap.exists()
          ? (conversationSnap.data() as Conversation)
          : null;
        resolvedRecipientId =
          conversationData?.user1_id === senderId
            ? conversationData?.user2_id
            : conversationData?.user1_id;
      }

      let participants =
        participantIds?.filter(Boolean) ||
        (conversationData
          ? this.getAllConversationParticipantIds(conversationData)
          : []);

      if (participants.length === 0) {
        const conversationSnap = await getDoc(
          doc(db, "conversations", conversationId),
        );
        conversationData = conversationSnap.exists()
          ? (conversationSnap.data() as Conversation)
          : null;
        participants = this.getAllConversationParticipantIds(conversationData);
      }

      if (!participants.includes(senderId)) participants.push(senderId);
      participants = participants.filter(
        (id, index, self) => id && self.indexOf(id) === index,
      );

      const messageRef = doc(collection(db, "messages"));
      const data: any = {
        conversation_id: conversationId,
        sender_id: senderId,
        participants,
        content: validatedContent,
        media_type: mediaType || "TEXT",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        is_delivered: false,
        is_seen: false,
      };
      if (mediaUrl) data.media_url = mediaUrl;
      if (replyTo) data.reply_to = replyTo;

      await setDoc(messageRef, data);

      if (!conversationId.startsWith("mock-")) {
        const conversationUpdates: Record<string, any> = {
          updated_at: serverTimestamp(),
          last_message_at: serverTimestamp(),
          last_message_content: content,
          [`unread_count_by_user.${senderId}`]: 0,
        };
        participants
          .filter((participantId) => participantId !== senderId)
          .forEach((participantId) => {
            conversationUpdates[`unread_count_by_user.${participantId}`] =
              increment(1);
          });
        await updateDoc(
          doc(db, "conversations", conversationId),
          conversationUpdates,
        );
      }

      const senderProfile =
        (await this.getCachedUserProfile(senderId)) ?? fallbackSender(senderId);

      const message: MessageWithSender = {
        id: messageRef.id,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        media_type: mediaType || "TEXT",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sender: {
          id: senderProfile.id,
          user_id: senderProfile.user_id || senderProfile.id,
          username: senderProfile.username,
          display_name: senderProfile.display_name,
          avatar_url: senderProfile.avatar_url,
        },
      };
      if (mediaUrl) (message as any).media_url = mediaUrl;
      if (replyTo) (message as any).reply_to = replyTo;

      await this.createMessageEvent({
        conversation_id: conversationId,
        user_id: senderId,
        event_type: "message_sent",
        data: { message_id: messageRef.id, participants },
      });

      return message;
    } catch (error) {
      console.error("❌ sendMessageWithDelivery:", error);
      throw error;
    }
  }

  async deleteMessageForEveryone(messageId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, "messages", messageId));
    } catch (error) {
      console.error("❌ deleteMessageForEveryone:", error);
      throw error;
    }
  }

  async getOlderMessages(
    conversationId: string,
    beforeCreatedAt: any,
    messageLimit = 50,
    visibleToUserId?: string,
  ): Promise<MessageWithSender[]> {
    try {
      const constraints: any[] = [
        where("conversation_id", "==", conversationId),
        where("created_at", "<", beforeCreatedAt),
      ];
      if (visibleToUserId) {
        constraints.push(
          where("participants", "array-contains", visibleToUserId),
        );
      }
      constraints.push(orderBy("created_at", "desc"), limit(messageLimit));
      const q = query(collection(db, "messages"), ...constraints);
      const snap = await getDocs(q);
      const rawMessages = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Message)
        .reverse();

      const uniqueSenderIds = [...new Set(rawMessages.map((m) => m.sender_id))];
      const profileResults = await Promise.allSettled(
        uniqueSenderIds.map((id) => this.getCachedUserProfile(id)),
      );
      const profileMap = new Map<string, any>();
      uniqueSenderIds.forEach((id, i) => {
        const r = profileResults[i];
        profileMap.set(
          id,
          r.status === "fulfilled" && r.value ? r.value : fallbackSender(id),
        );
      });

      return rawMessages.map((msg) => {
        const p = profileMap.get(msg.sender_id)!;
        return {
          ...msg,
          sender: {
            id: p.id,
            user_id: p.user_id || p.id,
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
          },
        };
      });
    } catch (error) {
      logFirestoreError("getOlderMessages failed:", error);
      return [];
    }
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    try {
      const q = query(
        collection(db, "messages"),
        where("conversation_id", "==", conversationId),
        orderBy("created_at", "asc"),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message);
    } catch (error) {
      logFirestoreError("getMessages failed:", error);
      return [];
    }
  }

  async markMessageAsSeen(
    messageId: string,
    userId: string,
    conversationId?: string,
  ): Promise<void> {
    try {
      const messageRef = doc(db, "messages", messageId);
      await updateDoc(messageRef, {
        is_seen: true,
        updated_at: serverTimestamp(),
      });

      // When conversationId is provided by the caller (from store state),
      // skip the getDoc re-read of the message we just updated.
      let resolvedConvId = conversationId;
      if (!resolvedConvId) {
        const snap = await getDoc(messageRef);
        resolvedConvId = snap.exists()
          ? snap.data()?.conversation_id
          : undefined;
      }

      if (resolvedConvId) {
        await updateDoc(doc(db, "conversations", resolvedConvId), {
          [`unread_count_by_user.${userId}`]: 0,
        });
        await this.createMessageEvent({
          conversation_id: resolvedConvId,
          user_id: userId,
          event_type: "message_seen",
          data: { message_id: messageId },
        });
      }
    } catch (error) {
      console.error("❌ markMessageAsSeen:", error);
      throw error;
    }
  }

  // ── Real-time subscriptions ────────────────────────────────────────────────

  subscribeToMessages(
    conversationId: string,
    callback: (messages: MessageWithSender[]) => void,
    messageLimit = 50,
    visibleToUserId?: string,
  ): Unsubscribe {
    // Fetch the latest messageLimit messages (DESC) so reads are bounded by
    // messageLimit, not conversation length. Reversed to present oldest-first.
    // For history beyond the limit use getOlderMessages().
    const constraints: any[] = [where("conversation_id", "==", conversationId)];
    if (visibleToUserId) {
      constraints.push(
        where("participants", "array-contains", visibleToUserId),
      );
    }
    constraints.push(orderBy("created_at", "desc"), limit(messageLimit));
    const q = query(collection(db, "messages"), ...constraints);

    return onSnapshot(
      q,
      async (querySnapshot) => {
        console.log(
          `📥 subscribeToMessages snapshot for ${conversationId}: ${querySnapshot.docs.length} docs, metadata:`,
          querySnapshot.metadata,
        );

        const rawMessages = querySnapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .reverse() as Message[];

        console.log(`📥 Raw messages count: ${rawMessages.length}`);

        // Fetch all unique sender profiles in parallel — never skip a message
        const uniqueSenderIds = [
          ...new Set(rawMessages.map((m) => m.sender_id)),
        ];
        const profileResults = await Promise.allSettled(
          uniqueSenderIds.map((id) => this.getCachedUserProfile(id)),
        );

        const profileMap = new Map<string, any>();
        uniqueSenderIds.forEach((id, i) => {
          const r = profileResults[i];
          profileMap.set(
            id,
            r.status === "fulfilled" && r.value ? r.value : fallbackSender(id),
          );
        });

        const messages: MessageWithSender[] = rawMessages.map((msg) => {
          const p = profileMap.get(msg.sender_id)!;
          return {
            ...msg,
            sender: {
              id: p.id,
              user_id: p.user_id || p.id,
              username: p.username,
              display_name: p.display_name,
              avatar_url: p.avatar_url,
            },
          };
        });

        console.log(`📥 Calling callback with ${messages.length} messages`);
        callback(messages);
      },
      (error) => {
        if (error?.code === "permission-denied") {
          console.warn(
            "subscribeToMessages closed because conversation access ended",
          );
          callback([]);
          return;
        }
        console.error("❌ subscribeToMessages snapshot error:", error);
      },
    );
  }

  subscribeToConversations(
    userId: string,
    callback: (conversations: ConversationWithUser[]) => void,
  ): Unsubscribe {
    const q1 = query(
      collection(db, "conversations"),
      where("user1_id", "==", userId),
    );
    const q2 = query(
      collection(db, "conversations"),
      where("user2_id", "==", userId),
    );

    // Both queries write into the same Map keyed by doc id.
    // A conversation can only appear in q1 OR q2 (not both) since a user
    // is either user1 or user2, never both. But to be safe, the Map
    // naturally deduplicates by id.
    const allDocs = new Map<string, any>();
    const q1Docs = new Map<string, any>();
    const q2Docs = new Map<string, any>();
    const profileMap = new Map<string, any>();
    const conversationCache = new Map<
      string,
      { cacheKey: string; conversation: ConversationWithUser }
    >();
    const unreadFallbackCache = new Map<
      string,
      { cacheKey: string; count: number }
    >();
    let q1Ready = false;
    let q2Ready = false;

    // Debounce timer — both snapshots fire within the same JS tick on mount.
    // We wait until both have responded before processing, then debounce
    // subsequent updates so rapid Firestore writes don't cause flicker.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const rebuildAllDocs = () => {
      allDocs.clear();
      q1Docs.forEach((data, id) => allDocs.set(id, data));
      q2Docs.forEach((data, id) => allDocs.set(id, data));
    };

    const scheduleProcess = () => {
      // Never process until BOTH queries have delivered their first snapshot
      if (!q1Ready || !q2Ready) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => processAndFlush(), 80);
    };

    const processAndFlush = async () => {
      // Collect unique other-user ids
      const entries = Array.from(allDocs.entries());
      const unreadCounts = await this.getUnreadCountsForConversationEntries(
        entries,
        userId,
        unreadFallbackCache,
      );
      const otherUserIds = [
        ...new Set(
          entries.map(([_, data]) =>
            data.user1_id === userId ? data.user2_id : data.user1_id,
          ),
        ),
      ];

      const missingProfileIds = otherUserIds.filter(
        (id) => !profileMap.has(id),
      );
      if (missingProfileIds.length > 0) {
        const profileResults = await Promise.allSettled(
          missingProfileIds.map((id) => this.getCachedUserProfile(id)),
        );
        missingProfileIds.forEach((id, i) => {
          const r = profileResults[i];
          profileMap.set(
            id,
            r.status === "fulfilled" && r.value ? r.value : fallbackSender(id),
          );
        });
      }

      otherUserIds.forEach((id) => {
        const sharedProfile = getCachedResolvedUserProfile(id);
        if (!sharedProfile) return;

        const existingProfile = profileMap.get(id);
        const existingLooksFallback =
          !existingProfile?.username ||
          existingProfile.username === `user_${id.slice(-6)}` ||
          existingProfile.username === "someone";

        if (
          existingLooksFallback ||
          existingProfile?.username !== sharedProfile.username ||
          existingProfile?.display_name !== sharedProfile.display_name ||
          existingProfile?.avatar_url !== sharedProfile.avatar_url
        ) {
          profileMap.set(id, sharedProfile);
        }
      });

      // Build result directly from raw doc data — zero extra Firestore reads
      const result: ConversationWithUser[] = entries.map(([id, data]) => {
        const otherUserId =
          data.user1_id === userId ? data.user2_id : data.user1_id;
        const p = profileMap.get(otherUserId)!;
        const cacheKey = this.getConversationSnapshotCacheKey(data, userId);
        const cachedConversation = conversationCache.get(id);
        if (cachedConversation?.cacheKey === cacheKey) {
          return cachedConversation.conversation;
        }

        const effectiveClearedAt =
          data.cleared_at_by_user?.[userId]?.toDate?.().toISOString() ??
          data.cleared_at_by_user?.[userId] ??
          data.cleared_at?.toDate?.().toISOString() ??
          data.cleared_at ??
          null;
        const lastMessageAt =
          data.last_message_at?.toDate?.().toISOString() ??
          data.last_message_at ??
          "";
        const lastMessageVisible =
          !effectiveClearedAt ||
          this.toMillis(lastMessageAt) > this.toMillis(effectiveClearedAt);

        const conversation: ConversationWithUser = {
          id,
          user1_id: data.user1_id,
          user2_id: data.user2_id,
          temporary_participant_ids: Array.isArray(
            data.temporary_participant_ids,
          )
            ? data.temporary_participant_ids
            : [],
          created_at:
            data.created_at?.toDate?.().toISOString() ?? data.created_at ?? "",
          updated_at:
            data.updated_at?.toDate?.().toISOString() ?? data.updated_at ?? "",
          last_message_at: lastMessageVisible ? lastMessageAt : "",
          last_message_content: lastMessageVisible
            ? (data.last_message_content ?? "")
            : "",
          cleared_at: effectiveClearedAt,
          other_user: {
            id: p.id,
            user_id: p.user_id || p.id,
            username: p.username ?? "",
            display_name: p.display_name ?? null,
            avatar_url: p.avatar_url ?? null,
          },
          unread_count: lastMessageVisible ? (unreadCounts.get(id) ?? 0) : 0,
          is_online: false,
          is_typing: false,
        };
        conversationCache.set(id, { cacheKey, conversation });
        return conversation;
      });

      const liveConversationIds = new Set(entries.map(([id]) => id));
      Array.from(conversationCache.keys()).forEach((conversationId) => {
        if (!liveConversationIds.has(conversationId)) {
          conversationCache.delete(conversationId);
          unreadFallbackCache.delete(conversationId);
        }
      });

      result.sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime(),
      );

      // Final dedup by other_user id — guards against duplicate Firestore
      // docs for the same pair of users (created before this fix was applied).
      // Keep the one with the most recent activity (already sorted first).
      const seenOtherUsers = new Set<string>();
      const deduped = result.filter((c) => {
        const key = c.other_user.user_id || c.other_user.id;
        if (seenOtherUsers.has(key)) return false;
        seenOtherUsers.add(key);
        return true;
      });

      callback(deduped);
    };

    const handleConversationSnapshotError = (
      source: "user1" | "user2",
      error: any,
    ) => {
      if (error?.code === "permission-denied") {
        console.warn(
          `[messaging] Conversation ${source} listener denied; waiting for auth/rules to settle.`,
        );
      } else {
        console.error(`❌ subscribeToConversations ${source} error:`, error);
      }
      if (source === "user1") {
        q1Docs.clear();
        q1Ready = true;
      } else {
        q2Docs.clear();
        q2Ready = true;
      }
      rebuildAllDocs();
      scheduleProcess();
    };

    const unsub1 = onSnapshot(
      q1,
      (snap) => {
        q1Docs.clear();
        snap.docs.forEach((d) => q1Docs.set(d.id, d.data()));
        rebuildAllDocs();
        q1Ready = true;
        scheduleProcess();
      },
      (error) => handleConversationSnapshotError("user1", error),
    );

    const unsub2 = onSnapshot(
      q2,
      (snap) => {
        q2Docs.clear();
        snap.docs.forEach((d) => q2Docs.set(d.id, d.data()));
        rebuildAllDocs();
        q2Ready = true;
        scheduleProcess();
      },
      (error) => handleConversationSnapshotError("user2", error),
    );

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub1();
      unsub2();
    };
  }

  // ── Typing & presence ──────────────────────────────────────────────────────

  setTypingIndicator(
    conversationId: string,
    userId: string,
    isTyping: boolean,
    typingSpeed?: "slow" | "normal" | "fast" | "furious",
  ): void {
    messagingDebug("setTypingIndicator:called", {
      conversationId,
      userId,
      isTyping,
      typingSpeed: typingSpeed || "normal",
    });
    void (async () => {
      try {
        const hasRealtimeAuth = await this.waitForRealtimeAuth(userId);
        messagingDebug("setTypingIndicator:authResult", {
          conversationId,
          userId,
          isTyping,
          hasRealtimeAuth,
        });
        if (!hasRealtimeAuth) {
          console.warn(
            "[messaging] Skipping typing RTDB write until Firebase Auth is ready.",
          );
          return;
        }
        const typingRef = ref(realtimeDb, `typing/${conversationId}/${userId}`);
        const ghostModeActive = await this.isGhostModeActive(userId);
        messagingDebug("setTypingIndicator:ghostModeResult", {
          conversationId,
          userId,
          isTyping,
          ghostModeActive,
        });

        if (ghostModeActive) {
          await set(typingRef, {
            is_typing: false,
            typing_speed: "normal",
            last_seen: new Date().toISOString(),
          });
          messagingDebug("setTypingIndicator:rtdbWriteGhostComplete", {
            path: `typing/${conversationId}/${userId}`,
          });
          await setDoc(
            doc(db, "presence", userId),
            {
              typing_in_conversation_id: null,
              typing_speed: "normal",
              last_seen: serverTimestamp(),
              updated_at: serverTimestamp(),
            },
            { merge: true },
          );
          messagingDebug("setTypingIndicator:presenceWriteGhostComplete", {
            path: `presence/${userId}`,
          });
          return;
        }

        await set(typingRef, {
          is_typing: isTyping,
          typing_speed: typingSpeed || "normal",
          last_seen: new Date().toISOString(),
        });
        messagingDebug("setTypingIndicator:rtdbWriteComplete", {
          path: `typing/${conversationId}/${userId}`,
          isTyping,
          typingSpeed: typingSpeed || "normal",
        });
        await setDoc(
          doc(db, "presence", userId),
          {
            typing_in_conversation_id: isTyping ? conversationId : null,
            typing_speed: isTyping ? typingSpeed || "normal" : "normal",
            last_seen: serverTimestamp(),
            updated_at: serverTimestamp(),
          },
          { merge: true },
        );
        messagingDebug("setTypingIndicator:presenceWriteComplete", {
          path: `presence/${userId}`,
          typingConversationId: isTyping ? conversationId : null,
          typingSpeed: isTyping ? typingSpeed || "normal" : "normal",
        });
        if (isTyping) {
          await onDisconnect(typingRef).set({
            is_typing: false,
            typing_speed: "normal",
            last_seen: new Date().toISOString(),
          });
          messagingDebug("setTypingIndicator:onDisconnectRegistered", {
            path: `typing/${conversationId}/${userId}`,
          });
        }
      } catch (error) {
        messagingDebug("setTypingIndicator:error", {
          conversationId,
          userId,
          isTyping,
          error,
        });
        console.error("❌ setTypingIndicator:", error);
      }
    })();
  }

  // ── Live draft text (letter-by-letter real-time preview) ──────────────────

  /**
   * Write the current draft text to RTDB so the other user can see it live.
   * Path: drafts/{conversationId}/{userId}
   */
  setDraftText(conversationId: string, userId: string, text: string): void {
    void (async () => {
      try {
        const path = `drafts/${conversationId}/${userId}`;
        console.log(
          "[draft service] Writing to RTDB path:",
          path,
          "text:",
          text,
        );
        const draftRef = ref(realtimeDb, path);
        const ghostModeActive = await this.isGhostModeActive(userId);

        if (ghostModeActive) {
          await set(draftRef, {
            text: "",
            updated_at: Date.now(),
          });
          return;
        }

        set(draftRef, {
          text,
          updated_at: Date.now(),
        })
          .then(() => {
            console.log("[draft service] Write SUCCESS to:", path);
          })
          .catch((err) => {
            console.error("[draft service] Write FAILED:", err);
          });
        // Auto-clear on disconnect (tab close, network loss)
        onDisconnect(draftRef).remove();
      } catch (error) {
        console.error("❌ setDraftText:", error);
      }
    })();
  }

  /**
   * Clear draft text (after send or when input is emptied).
   */
  clearDraftText(conversationId: string, userId: string): void {
    try {
      const draftRef = ref(realtimeDb, `drafts/${conversationId}/${userId}`);
      set(draftRef, null);
    } catch (error) {
      console.error("❌ clearDraftText:", error);
    }
  }

  /**
   * Subscribe to the other user's live draft text.
   * Returns unsubscribe function.
   */
  subscribeToDraftText(
    conversationId: string,
    currentUserId: string,
    callback: (draft: { userId: string; text: string } | null) => void,
  ): () => void {
    const path = `drafts/${conversationId}`;
    console.log(
      "[draft service] Subscribing to RTDB path:",
      path,
      "currentUserId:",
      currentUserId,
    );
    const draftsRef = ref(realtimeDb, path);
    const unsub = onValue(draftsRef, (snapshot) => {
      const data = snapshot.val();
      console.log(
        "[draft service] onValue fired, raw data:",
        JSON.stringify(data),
      );
      if (!data) {
        callback(null);
        return;
      }
      // Find the other user's draft (not our own)
      for (const uid in data) {
        if (uid === currentUserId) continue;
        const draft = data[uid];
        console.log(
          "[draft service] Found draft from uid:",
          uid,
          "draft:",
          draft,
        );
        if (draft?.text && draft.text.length > 0) {
          callback({ userId: uid, text: draft.text });
          return;
        }
      }
      callback(null);
    });
    return unsub;
  }

  subscribeToFriendsOnlineStatus(
    userId: string,
    callback: (onlineFriends: string[]) => void,
  ): Unsubscribe {
    const unsubscribes: Array<() => void> = [];
    const online = new Set<string>();

    friendsService.getFriends(userId).then((response: any) => {
      const friends = Array.isArray(response)
        ? response
        : (response?.friends ?? []);

      const subscribedFriendIds = new Set<string>();
      friends.forEach((f: any) => {
        const friendId: string = f.user_id || f.userId || f.id;
        if (!friendId || subscribedFriendIds.has(friendId)) return;
        subscribedFriendIds.add(friendId);
        const statusRef = ref(realtimeDb, `online_status/${friendId}`);
        const unsub = onValue(statusRef, (snap) => {
          if (snap.val()?.is_online) {
            online.add(friendId);
          } else {
            online.delete(friendId);
          }
          callback(Array.from(online));
        });
        unsubscribes.push(unsub);
      });
    });

    return () => unsubscribes.forEach((u) => u());
  }

  subscribeToUsersOnlineStatus(
    userIds: string[],
    callback: (onlineIds: string[]) => void,
  ): Unsubscribe {
    if (userIds.length === 0) return () => {};
    const online = new Set<string>();
    const unsubscribes: Array<() => void> = [];

    userIds.forEach((uid) => {
      const statusRef = ref(realtimeDb, `online_status/${uid}`);
      const unsub = onValue(statusRef, (snap) => {
        if (snap.val()?.is_online) {
          online.add(uid);
        } else {
          online.delete(uid);
        }
        callback(Array.from(online));
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }

  subscribeToUsersPresenceStatus(
    userIds: string[],
    callback: (statuses: UserPresenceStatus[]) => void,
  ): Unsubscribe {
    if (userIds.length === 0) return () => {};
    const statusByUserId = new Map<string, UserPresenceStatus>();
    const unsubscribes: Array<() => void> = [];

    userIds.forEach((uid) => {
      const statusRef = ref(realtimeDb, `online_status/${uid}`);
      const unsub = onValue(statusRef, (snap) => {
        const data = snap.val() || {};
        statusByUserId.set(uid, {
          userId: uid,
          isOnline: data?.is_online === true,
          lastSeen: data?.last_seen ?? null,
          timezone:
            typeof data?.timezone === "string" && data.timezone
              ? data.timezone
              : "",
        });
        callback(Array.from(statusByUserId.values()));
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }

  subscribeToUsersLivePresenceStatus(
    userIds: string[],
    callback: (statuses: UserPresenceStatus[]) => void,
  ): Unsubscribe {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) return () => {};

    const rtdbStatusByUserId = new Map<string, UserPresenceStatus>();
    const firestoreStatusByUserId = new Map<string, UserPresenceStatus>();
    const unsubscribes: Array<() => void> = [];
    let cancelled = false;

    const emit = () => {
      const mergedStatuses = uniqueUserIds.map((userId) => {
          const firestoreStatus = firestoreStatusByUserId.get(userId);
          const rtdbStatus = rtdbStatusByUserId.get(userId);
          return {
            userId,
            isOnline:
              firestoreStatus?.isOnline === true ||
              rtdbStatus?.isOnline === true,
            lastSeen: rtdbStatus?.lastSeen ?? firestoreStatus?.lastSeen ?? null,
            timezone: rtdbStatus?.timezone || firestoreStatus?.timezone || "",
            typingConversationId: firestoreStatus?.typingConversationId ?? null,
            typingSpeed: firestoreStatus?.typingSpeed,
          };
        });
      messagingDebug("presence:emitMergedStatuses", {
        requestedUserIds: uniqueUserIds,
        rtdbStatusByUserId: Object.fromEntries(rtdbStatusByUserId),
        firestoreStatusByUserId: Object.fromEntries(firestoreStatusByUserId),
        mergedStatuses,
      });
      callback(mergedStatuses);
    };

    const attachListeners = () => {
      if (cancelled) return;
      messagingDebug("presence:attachListeners", {
        uniqueUserIds,
      });

      uniqueUserIds.forEach((uid) => {
        const statusRef = ref(realtimeDb, `online_status/${uid}`);
        messagingDebug("presence:rtdbListenerAttaching", {
          uid,
          path: `online_status/${uid}`,
        });
        const unsub = onValue(
          statusRef,
          (snap) => {
            const data = snap.val() || {};
            const interpretedStatus = {
              userId: uid,
              isOnline:
                data?.is_online === true ||
                (data?.is_online !== false &&
                  isRecentPresenceTime(data?.last_seen)),
              lastSeen: data?.last_seen ?? null,
              timezone:
                typeof data?.timezone === "string" && data.timezone
                  ? data.timezone
                  : "",
            };
            messagingDebug("presence:rtdbSnapshot", {
              uid,
              exists: snap.exists(),
              raw: data,
              interpretedStatus,
            });
            rtdbStatusByUserId.set(uid, interpretedStatus);
            emit();
          },
          (error) => {
            messagingDebug("presence:rtdbSnapshotError", {
              uid,
              error,
            });
            console.error(
              "[messaging] RTDB presence subscription failed:",
              error,
            );
            rtdbStatusByUserId.set(uid, {
              userId: uid,
              isOnline: false,
              lastSeen: null,
              timezone: "",
            });
            emit();
          },
        );
        unsubscribes.push(unsub);
      });

      for (let index = 0; index < uniqueUserIds.length; index += 10) {
        const chunk = uniqueUserIds.slice(index, index + 10);
        const presenceQuery = query(
          collection(db, "presence"),
          where(documentId(), "in", chunk),
        );
        messagingDebug("presence:firestoreListenerAttaching", {
          chunk,
          path: "presence",
        });
        const unsub = onSnapshot(
          presenceQuery,
          (snapshot) => {
            messagingDebug("presence:firestoreSnapshotReceived", {
              chunk,
              docCount: snapshot.docs.length,
              fromCache: snapshot.metadata.fromCache,
              hasPendingWrites: snapshot.metadata.hasPendingWrites,
              docs: snapshot.docs.map((presenceDoc) => ({
                id: presenceDoc.id,
                raw: presenceDoc.data(),
              })),
            });
            chunk.forEach((uid) => {
              if (
                !snapshot.docs.some((presenceDoc) => presenceDoc.id === uid)
              ) {
                messagingDebug("presence:firestoreMissingDoc", {
                  uid,
                  chunk,
                });
                firestoreStatusByUserId.set(uid, {
                  userId: uid,
                  isOnline: false,
                  lastSeen: null,
                  timezone: "",
                  typingConversationId: null,
                });
              }
            });
            snapshot.docs.forEach((presenceDoc) => {
              const data = presenceDoc.data();
              const interpretedStatus = {
                userId: presenceDoc.id,
                isOnline:
                  data?.is_online === true ||
                  (data?.is_online !== false &&
                    isRecentPresenceTime(data?.last_seen)),
                lastSeen: data?.last_seen ?? null,
                timezone:
                  typeof data?.timezone === "string" && data.timezone
                    ? data.timezone
                    : "",
                typingConversationId:
                  typeof data?.typing_in_conversation_id === "string"
                    ? data.typing_in_conversation_id
                    : null,
                typingSpeed:
                  typeof data?.typing_speed === "string"
                    ? data.typing_speed
                    : undefined,
              };
              messagingDebug("presence:firestoreDocInterpreted", {
                uid: presenceDoc.id,
                raw: data,
                interpretedStatus,
              });
              firestoreStatusByUserId.set(presenceDoc.id, interpretedStatus);
            });
            emit();
          },
          (error) => {
            messagingDebug("presence:firestoreSnapshotError", {
              chunk,
              error,
            });
            console.error(
              "[messaging] Firestore presence subscription failed:",
              error,
            );
            emit();
          },
        );
        unsubscribes.push(unsub);
      }
    };

    console.log(
      "🔍 [MessagingService DEBUG] subscribeToUsersLivePresenceStatus called:",
      {
        uniqueUserIds,
        waitingForAuth: true,
      },
    );

    messagingDebug("presence:subscribeCalled", {
      uniqueUserIds,
      waitingForAuth: true,
    });

    void this.waitForAnyRealtimeAuth().then((ready) => {
      messagingDebug("presence:authWaitResult", {
        uniqueUserIds,
        ready,
      });
      console.log("🔍 [MessagingService] Auth ready for presence:", ready);
      if (!ready) {
        console.warn(
          "[messaging] Skipping presence subscription — Firebase Auth not ready.",
        );
        return;
      }
      console.log(
        "🔍 [MessagingService] Attaching RTDB presence listeners for:",
        uniqueUserIds,
      );
      attachListeners();
    });

    return () => {
      cancelled = true;
      messagingDebug("presence:cleanup", {
        uniqueUserIds,
        unsubscribeCount: unsubscribes.length,
      });
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }

  subscribeToConversationsTyping(
    conversationIds: string[],
    currentUserId: string,
    callback: (typingByConvId: Map<string, string[]>) => void,
  ): Unsubscribe {
    if (conversationIds.length === 0) return () => {};
    const typingMap = new Map<string, string[]>();
    const unsubscribes: Array<() => void> = [];
    let cancelled = false;
    messagingDebug("typingList:subscribeCalled", {
      conversationIds,
      currentUserId,
      waitingForAuth: true,
    });

    const attachListeners = () => {
      if (cancelled) return;
      messagingDebug("typingList:attachListeners", {
        conversationIds,
        currentUserId,
      });
      conversationIds.forEach((convId) => {
        const typingRef = ref(realtimeDb, `typing/${convId}`);
        messagingDebug("typingList:rtdbListenerAttaching", {
          convId,
          path: `typing/${convId}`,
          currentUserId,
        });
        const unsub = onValue(
          typingRef,
          (snap) => {
            const data = snap.val() || {};
            const typingUserIds = Object.entries(data)
              .filter(
                ([uid, val]) =>
                  uid !== currentUserId && (val as any)?.is_typing === true,
              )
              .map(([uid]) => uid);
            typingMap.set(convId, typingUserIds);
            messagingDebug("typingList:rtdbSnapshot", {
              convId,
              exists: snap.exists(),
              raw: data,
              currentUserId,
              typingUserIds,
              typingMap: Object.fromEntries(typingMap),
            });
            callback(new Map(typingMap));
          },
          (error) => {
            messagingDebug("typingList:rtdbSnapshotError", {
              convId,
              currentUserId,
              error,
            });
            console.error(
              "[messaging] RTDB typing subscription failed:",
              error,
            );
          },
        );
        unsubscribes.push(unsub);
      });
    };

    console.log(
      "🔍 [MessagingService DEBUG] subscribeToConversationsTyping called:",
      {
        conversationIds,
        currentUserId,
        waitingForAuth: true,
      },
    );

    void this.waitForAnyRealtimeAuth().then((ready) => {
      console.log("🔍 [MessagingService DEBUG] Auth wait result for typing:", {
        ready,
        conversationIds,
      });
      messagingDebug("typingList:authWaitResult", {
        conversationIds,
        currentUserId,
        ready,
      });
      if (!ready) {
        console.warn(
          "[messaging] Skipping conversations typing subscription — Firebase Auth not ready.",
        );
        return;
      }
      console.log(
        "🔍 [MessagingService DEBUG] Attaching RTDB typing listeners for:",
        conversationIds,
      );
      attachListeners();
    });

    return () => {
      cancelled = true;
      messagingDebug("typingList:cleanup", {
        conversationIds,
        currentUserId,
        unsubscribeCount: unsubscribes.length,
      });
      unsubscribes.forEach((u) => u());
    };
  }

  setOnlineStatus(userId: string, isOnline: boolean): void {
    const writeVersion = (this.onlineStatusWriteVersion.get(userId) ?? 0) + 1;
    this.onlineStatusWriteVersion.set(userId, writeVersion);
    messagingDebug("setOnlineStatus:called", {
      userId,
      isOnline,
      writeVersion,
    });

    void (async () => {
      try {
        const hasRealtimeAuth = await this.waitForRealtimeAuth(userId);
        messagingDebug("setOnlineStatus:authResult", {
          userId,
          isOnline,
          writeVersion,
          hasRealtimeAuth,
        });
        if (this.onlineStatusWriteVersion.get(userId) !== writeVersion) {
          messagingDebug("setOnlineStatus:staleWriteSkipped", {
            userId,
            isOnline,
            writeVersion,
            latestWriteVersion: this.onlineStatusWriteVersion.get(userId),
          });
          return;
        }
        if (!hasRealtimeAuth) {
          console.warn(
            "[messaging] Skipping online RTDB write until Firebase Auth is ready.",
          );
          return;
        }
        const statusRef = ref(realtimeDb, `online_status/${userId}`);
        const timezone = getClientTimeZone();
        messagingDebug("setOnlineStatus:rtdbWriteStart", {
          path: `online_status/${userId}`,
          userId,
          isOnline,
          timezone,
        });
        await set(statusRef, {
          is_online: isOnline,
          last_seen: rtdbServerTimestamp(),
          timezone,
        });
        messagingDebug("setOnlineStatus:rtdbWriteComplete", {
          path: `online_status/${userId}`,
          userId,
          isOnline,
          timezone,
        });
        messagingDebug("setOnlineStatus:firestoreWriteStart", {
          path: `presence/${userId}`,
          userId,
          isOnline,
          timezone,
        });
        await setDoc(
          doc(db, "presence", userId),
          {
            user_id: userId,
            is_online: isOnline,
            last_seen: serverTimestamp(),
            timezone,
            updated_at: serverTimestamp(),
          },
          { merge: true },
        );
        messagingDebug("setOnlineStatus:firestoreWriteComplete", {
          path: `presence/${userId}`,
          userId,
          isOnline,
          timezone,
        });
        if (isOnline) {
          await onDisconnect(statusRef).set({
            is_online: false,
            last_seen: rtdbServerTimestamp(),
            timezone,
          });
          messagingDebug("setOnlineStatus:onDisconnectRegistered", {
            path: `online_status/${userId}`,
            userId,
          });
        }
      } catch (error) {
        messagingDebug("setOnlineStatus:error", {
          userId,
          isOnline,
          writeVersion,
          error,
        });
        console.error("❌ setOnlineStatus:", error);
      }
    })();
  }

  // ── Typing subscription (listen for other user typing in a conversation) ──

  subscribeToTypingIndicators(
    conversationId: string,
    currentUserId: string,
    callback: (
      typingUsers: Array<{
        user_id: string;
        is_typing: boolean;
        typing_speed?: string;
      }>,
    ) => void,
  ): () => void {
    let cancelled = false;
    let detach: (() => void) | null = null;

    console.log(
      "🔍 [MessagingService DEBUG] subscribeToTypingIndicators called:",
      {
        conversationId,
        currentUserId,
        waitingForAuth: true,
      },
    );

    void this.waitForAnyRealtimeAuth().then((ready) => {
      console.log(
        "🔍 [MessagingService DEBUG] Auth wait result for typing indicators:",
        {
          ready,
          conversationId,
        },
      );
      if (cancelled || !ready) {
        if (!ready) {
          console.warn(
            "[messaging] Skipping typing indicators subscription — Firebase Auth not ready.",
          );
        }
        return;
      }
      console.log(
        "🔍 [MessagingService DEBUG] Attaching RTDB typing indicator listener for:",
        conversationId,
      );
      const typingRef = ref(realtimeDb, `typing/${conversationId}`);
      detach = onValue(
        typingRef,
        (snapshot) => {
          const data = snapshot.val() || {};
          console.log(
            "🔍 [MessagingService DEBUG] Typing indicator RTDB data:",
            {
              conversationId,
              data,
            },
          );
          const typingUsers: Array<{
            user_id: string;
            is_typing: boolean;
            typing_speed?: string;
          }> = [];
          for (const uid in data) {
            if (uid === currentUserId) continue; // Skip self
            if (data[uid]?.is_typing) {
              typingUsers.push({
                user_id: uid,
                is_typing: true,
                typing_speed: data[uid]?.typing_speed,
              });
            }
          }
          console.log("🔍 [MessagingService DEBUG] Processed typing users:", {
            conversationId,
            typingUsers,
          });
          callback(typingUsers);
        },
        (error) => {
          console.error(
            "[messaging] RTDB typing indicators subscription failed:",
            error,
          );
        },
      );
    });

    return () => {
      cancelled = true;
      if (detach) detach();
    };
  }

  // ── Freeze / Unfreeze chat ─────────────────────────────────────────────────

  freezeChat(conversationId: string, userId: string): void {
    try {
      const freezeRef = ref(realtimeDb, `frozen_chats/${conversationId}`);
      set(freezeRef, {
        is_frozen: true,
        frozen_by: userId,
        frozen_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ freezeChat:", error);
    }
  }

  unfreezeChat(conversationId: string, userId: string): void {
    try {
      const freezeRef = ref(realtimeDb, `frozen_chats/${conversationId}`);
      // Only the person who froze it can unfreeze — read current state first
      get(freezeRef).then((snap) => {
        const data = snap.val();
        if (data && data.frozen_by === userId) {
          set(freezeRef, {
            is_frozen: false,
            frozen_by: null,
            frozen_at: null,
          });
        }
      });
    } catch (error) {
      console.error("❌ unfreezeChat:", error);
    }
  }

  subscribeToFreezeStatus(
    conversationId: string,
    callback: (data: { is_frozen: boolean; frozen_by: string | null }) => void,
  ): () => void {
    const freezeRef = ref(realtimeDb, `frozen_chats/${conversationId}`);
    const unsub = onValue(freezeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        callback({
          is_frozen: !!data.is_frozen,
          frozen_by: data.frozen_by || null,
        });
      } else {
        callback({ is_frozen: false, frozen_by: null });
      }
    });
    return unsub;
  }

  // ── Event Tracking ───────────────────────────────────────────────────────

  async trackScreenshot(
    conversationId: string,
    userId: string,
    messageId?: string,
  ): Promise<void> {
    try {
      await this.createMessageEvent({
        conversation_id: conversationId,
        user_id: userId,
        event_type: "screenshot",
        data: { message_id: messageId },
      });
    } catch (error) {
      console.error("❌ trackScreenshot:", error);
      throw error;
    }
  }

  async trackChatSwitch(
    conversationId: string,
    userId: string,
    targetUserName: string,
    targetUserId: string,
    recipientUserId?: string,
  ): Promise<void> {
    try {
      if (await this.isGhostModeActive(userId)) {
        return;
      }

      await this.createMessageEvent({
        conversation_id: conversationId,
        user_id: userId,
        event_type: "chat_switch",
        data: {
          target_user_name: targetUserName,
          target_user_id: targetUserId,
          recipient_user_id: recipientUserId,
        },
      });
    } catch (error) {
      console.error("❌ trackChatSwitch:", error);
      throw error;
    }
  }

  async emitOptimisticChatSwitchSignal(
    conversationId: string,
    userId: string,
    targetUserName: string,
    targetUserId: string,
    recipientUserId?: string,
  ): Promise<void> {
    try {
      if (await this.isGhostModeActive(userId)) {
        return;
      }

      const signalsRef = ref(
        realtimeDb,
        `chat_switch_signals/${conversationId}`,
      );
      const signalRef = push(signalsRef);
      if (!signalRef.key) return;

      await set(signalRef, {
        conversation_id: conversationId,
        user_id: userId,
        target_user_id: targetUserId,
        target_user_name: targetUserName,
        recipient_user_id: recipientUserId || "",
        created_at: Date.now(),
      });
    } catch (error) {
      console.error("❌ emitOptimisticChatSwitchSignal:", error);
    }
  }

  subscribeToOptimisticChatSwitchSignals(
    conversationId: string,
    currentUserId: string,
    callback: (signal: ChatSwitchSignal) => void,
  ): () => void {
    const signalsRef = ref(realtimeDb, `chat_switch_signals/${conversationId}`);
    const seenSignalIds = new Set<string>();

    const unsubscribe = onValue(signalsRef, (snapshot) => {
      const rawSignals = snapshot.val() || {};
      const now = Date.now();

      Object.entries(rawSignals)
        .sort(
          (a, b) =>
            Number((a[1] as any)?.created_at || 0) -
            Number((b[1] as any)?.created_at || 0),
        )
        .forEach(([signalId, rawSignal]) => {
          if (seenSignalIds.has(signalId)) return;
          seenSignalIds.add(signalId);

          const signal = rawSignal as Partial<ChatSwitchSignal>;
          const recipientUserId = String(signal.recipient_user_id || "");
          const createdAt = Number(signal.created_at || 0);

          if (recipientUserId && recipientUserId !== currentUserId) return;
          if (!createdAt || now - createdAt > 30_000) return;

          callback({
            id: signalId,
            conversation_id: conversationId,
            user_id: String(signal.user_id || ""),
            target_user_id: String(signal.target_user_id || ""),
            target_user_name: String(signal.target_user_name || "someone"),
            recipient_user_id: recipientUserId || undefined,
            created_at: createdAt,
          });
        });
    });

    return unsubscribe;
  }

  async trackOpenedNoReply(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    try {
      if (await this.isGhostModeActive(userId)) {
        return;
      }

      await this.createMessageEvent({
        conversation_id: conversationId,
        user_id: userId,
        event_type: "opened_noreply",
      });
    } catch (error) {
      console.error("❌ trackOpenedNoReply:", error);
      throw error;
    }
  }

  async trackLongUnsent(
    conversationId: string,
    userId: string,
    content: string,
  ): Promise<void> {
    try {
      if (await this.isGhostModeActive(userId)) {
        return;
      }

      await this.createMessageEvent({
        conversation_id: conversationId,
        user_id: userId,
        event_type: "long_unsent",
        data: { content: content.substring(0, 100) }, // Store first 100 chars
      });
    } catch (error) {
      console.error("❌ trackLongUnsent:", error);
      throw error;
    }
  }

  async trackMention(
    conversationId: string,
    userId: string,
    mentionedUsername: string,
  ): Promise<void> {
    try {
      if (await this.isGhostModeActive(userId)) {
        return;
      }

      console.log(
        "[@mention service] Writing mention doc:",
        conversationId,
        mentionedUsername,
      );
      // Write directly with a real timestamp (not serverTimestamp) so the
      // event is immediately available to ALL subscribers via onSnapshot.
      const eventRef = doc(collection(db, "message_events"));
      const eventData = {
        conversation_id: conversationId,
        user_id: userId,
        event_type: "mention",
        data: { mentioned_username: mentionedUsername },
        created_at: new Date().toISOString(), // Use string like existing events
      };
      console.log("[@mention service] Event data being written:", eventData);
      await setDoc(eventRef, eventData);
      console.log("[@mention service] Mention doc written, ID:", eventRef.id);
    } catch (error) {
      console.error("[@mention service] Error:", error);
      throw error;
    }
  }

  async trackIgnoredMessage(
    conversationId: string,
    userId: string,
    targetUserName: string,
    ignoredUserName?: string,
  ): Promise<void> {
    try {
      if (await this.isGhostModeActive(userId)) {
        return;
      }

      console.log(
        "[@ignored service] Writing ignored event:",
        conversationId,
        targetUserName,
      );
      const eventRef = doc(collection(db, "message_events"));
      const eventData = {
        conversation_id: conversationId,
        user_id: userId,
        event_type: "ignored",
        data: {
          user_name: targetUserName,
          ignored_user_name: ignoredUserName,
          ignored_direction: "they_ignored_me",
        },
        created_at: new Date().toISOString(),
      };
      console.log("[@ignored service] Event data being written:", eventData);
      await setDoc(eventRef, eventData);
      console.log("[@ignored service] Ignored event written, ID:", eventRef.id);
    } catch (error) {
      console.error("[@ignored service] Error:", error);
      throw error;
    }
  }

  subscribeToEvents(
    conversationId: string,
    callback: (events: MessageEvent[]) => void,
    visibleToUserId?: string,
  ): Unsubscribe {
    console.log(
      "[@mention service] Subscribing to events for conversation:",
      conversationId,
    );
    const constraints: any[] = [where("conversation_id", "==", conversationId)];
    if (visibleToUserId) {
      constraints.push(
        where("participants", "array-contains", visibleToUserId),
      );
    }
    constraints.push(orderBy("created_at", "desc"), limit(50));
    const q = query(collection(db, "message_events"), ...constraints);

    return onSnapshot(
      q,
      (querySnapshot) => {
        const events = querySnapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as MessageEvent[];
        console.log(
          "[@mention service] Received total events:",
          events.length,
          events.map((e) => ({
            id: e.id,
            type: e.event_type,
            created_at: e.created_at,
          })),
        );
        const mentionEvents = events.filter((e) => e.event_type === "mention");
        if (mentionEvents.length > 0) {
          console.log(
            "[@mention service] Received mention events:",
            mentionEvents,
          );
        }
        callback(events);
      },
      (error) => {
        if (error?.code === "permission-denied") {
          console.warn(
            "subscribeToEvents closed because conversation access ended",
          );
          callback([]);
          return;
        }
        console.error("❌ subscribeToEvents snapshot error:", error);
      },
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getLastMessage(
    conversationId: string,
  ): Promise<MessageWithSender | undefined> {
    try {
      const q = query(
        collection(db, "messages"),
        where("conversation_id", "==", conversationId),
        orderBy("created_at", "desc"),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) return undefined;

      const d = snap.docs[0];
      const msg = { id: d.id, ...d.data() } as Message;
      const p =
        (await this.getCachedUserProfile(msg.sender_id)) ??
        fallbackSender(msg.sender_id);

      return {
        ...msg,
        sender: {
          id: p.id,
          user_id: p.user_id || p.id,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        },
      };
    } catch (error) {
      logFirestoreError("getLastMessage failed:", error);
      return undefined;
    }
  }

  private async getUnreadCount(
    conversationId: string,
    userId: string,
  ): Promise<number> {
    try {
      const q = query(
        collection(db, "messages"),
        where("conversation_id", "==", conversationId),
        orderBy("created_at", "desc"),
        limit(100),
      );
      const snap = await getDocs(q);
      let count = 0;
      snap.forEach((d) => {
        const msg = d.data() as Message;
        if (msg.sender_id !== userId && !msg.is_seen) count++;
      });
      return count;
    } catch (error) {
      logFirestoreError("getUnreadCount failed:", error);
      return 0;
    }
  }

  private async getConversationUnreadCount(
    conversation: Conversation,
    userId: string,
  ): Promise<number> {
    const mappedCount = conversation.unread_count_by_user?.[userId];
    if (typeof mappedCount === "number") {
      return mappedCount;
    }
    return this.getUnreadCount(conversation.id, userId);
  }

  private async getUnreadCountsForConversationEntries(
    entries: Array<[string, any]>,
    userId: string,
    fallbackCache?: Map<string, { cacheKey: string; count: number }>,
  ): Promise<Map<string, number>> {
    const unreadCounts = new Map<string, number>();
    const fallbackConversationIds: string[] = [];

    entries.forEach(([conversationId, data]) => {
      const mappedCount = data?.unread_count_by_user?.[userId];
      if (typeof mappedCount === "number") {
        unreadCounts.set(conversationId, mappedCount);
        fallbackCache?.delete(conversationId);
      } else {
        const cacheKey = this.getUnreadFallbackCacheKey(data);
        const cachedFallback = fallbackCache?.get(conversationId);

        if (cachedFallback?.cacheKey === cacheKey) {
          unreadCounts.set(conversationId, cachedFallback.count);
        } else {
          fallbackConversationIds.push(conversationId);
        }
      }
    });

    if (fallbackConversationIds.length === 0) {
      return unreadCounts;
    }

    const fallbackResults = await Promise.all(
      fallbackConversationIds.map(
        async (conversationId) =>
          [
            conversationId,
            await this.getUnreadCount(conversationId, userId),
          ] as const,
      ),
    );

    fallbackResults.forEach(([conversationId, count]) => {
      unreadCounts.set(conversationId, count);
      const conversationData = entries.find(
        ([id]) => id === conversationId,
      )?.[1];
      if (conversationData) {
        fallbackCache?.set(conversationId, {
          cacheKey: this.getUnreadFallbackCacheKey(conversationData),
          count,
        });
      }
    });

    return unreadCounts;
  }

  private getConversationSnapshotCacheKey(data: any, userId: string): string {
    const otherUserId =
      data.user1_id === userId ? data.user2_id : data.user1_id;
    const unreadCount = data?.unread_count_by_user?.[userId];
    const effectiveClearedAt =
      data?.cleared_at_by_user?.[userId] ?? data?.cleared_at;
    const sharedProfile = getCachedResolvedUserProfile(otherUserId);
    const profileFingerprint = [
      sharedProfile?.username || "",
      sharedProfile?.display_name || "",
      sharedProfile?.avatar_url || "",
    ].join("~");

    return [
      otherUserId || "",
      profileFingerprint,
      this.normalizeCacheTimestamp(data.updated_at),
      this.normalizeCacheTimestamp(data.last_message_at),
      data.last_message_content || "",
      this.normalizeCacheTimestamp(effectiveClearedAt),
      Array.isArray(data.temporary_participant_ids)
        ? data.temporary_participant_ids.join(",")
        : "",
      typeof unreadCount === "number" ? unreadCount : "fallback",
    ].join("|");
  }

  private toMillis(raw: any): number {
    if (!raw) return 0;
    if (typeof raw === "object" && "toDate" in raw) {
      return raw.toDate().getTime();
    }
    const parsed = new Date(String(raw)).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getUnreadFallbackCacheKey(data: any): string {
    return [
      this.normalizeCacheTimestamp(data.updated_at),
      this.normalizeCacheTimestamp(data.last_message_at),
      data.last_message_content || "",
    ].join("|");
  }

  private normalizeCacheTimestamp(value: any): string {
    if (value instanceof Timestamp) {
      return value.toMillis().toString();
    }

    if (value?.toDate) {
      return value.toDate().getTime().toString();
    }

    return String(value || "");
  }

  private async getTypingStatus(
    conversationId: string,
    userId: string,
  ): Promise<TypingIndicator | null> {
    try {
      const typingRef = ref(realtimeDb, `typing/${conversationId}/${userId}`);
      const snapshot = await Promise.race([
        get(typingRef),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (snapshot && (snapshot as any).exists?.()) {
        return (snapshot as any).val() as TypingIndicator;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async createMessageEvent(
    eventData: Omit<MessageEvent, "id" | "created_at">,
  ): Promise<MessageEvent> {
    try {
      const eventRef = doc(collection(db, "message_events"));
      const providedParticipants = Array.isArray(eventData.data?.participants)
        ? eventData.data.participants
        : [];
      const participants =
        providedParticipants.length > 0
          ? providedParticipants
          : await this.getActiveParticipantIdsForConversation(
              eventData.conversation_id,
            );
      const eventPayload = {
        ...eventData,
        participants: participants.filter(
          (id: string, index: number, self: string[]) =>
            !!id && self.indexOf(id) === index,
        ),
        data: eventData.data
          ? Object.fromEntries(
              Object.entries(eventData.data).filter(
                ([key]) => key !== "participants",
              ),
            )
          : eventData.data,
      };
      // Use server timestamp for more accurate timing
      const data = {
        ...eventPayload,
        created_at: serverTimestamp(),
      };
      await setDoc(eventRef, data);

      // Return with proper timestamp format
      const created_at = new Date().toISOString(); // Fallback for immediate return
      return { id: eventRef.id, ...eventPayload, created_at } as MessageEvent;
    } catch (error) {
      console.error("❌ createMessageEvent:", error);
      throw error;
    }
  }

  private async getUserProfile(userId: string): Promise<any> {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (!snap.exists()) return null;
      return primeResolvedUserProfile(userId, { id: snap.id, ...snap.data() });
    } catch (error) {
      logFirestoreError("getUserProfile failed:", error);
      return null;
    }
  }

  async clearMessages(
    conversationId: string,
    userId: string,
    clearedAt: string,
  ): Promise<void> {
    try {
      console.log(
        `[messagingService] clearMessages called for conversation: ${conversationId}`,
      );
      const conversationRef = doc(db, "conversations", conversationId);
      const conversationSnap = await getDoc(conversationRef);
      if (conversationSnap.exists()) {
        const conversationData = conversationSnap.data() as Conversation;
        const unreadCountByUser = {
          ...(conversationData.unread_count_by_user || {}),
          [userId]: 0,
        };
        const clearedAtByUser = {
          ...(conversationData.cleared_at_by_user || {}),
          [userId]: clearedAt,
        };

        await updateDoc(conversationRef, {
          unread_count_by_user: unreadCountByUser,
          cleared_at_by_user: clearedAtByUser,
          updated_at: serverTimestamp(),
        });
      }

      console.log(
        `[messagingService] Stored personal clear timestamp for user ${userId} in conversation ${conversationId}`,
      );
      const messagesToDelete = { length: 0 };

      console.log(
        `✅ Cleared ${messagesToDelete.length} messages from conversation ${conversationId}`,
      );
    } catch (error) {
      console.error("❌ clearMessages:", error);
      throw error;
    }
  }
}

export const messagingService = new MessagingService();
