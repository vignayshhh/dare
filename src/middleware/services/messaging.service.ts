import { db, realtimeDb } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  Timestamp,
  increment,
} from "firebase/firestore";
import { ref, onValue, get, set, onDisconnect, push } from "firebase/database";
import { friendsService } from "./friends.service";
import {
  getCachedResolvedUserProfile,
  primeResolvedUserProfile,
  resolveUserProfile,
} from "@/utils/profileResolver";
import { validateRequiredText, SECURITY_LIMITS } from "@/security/appSecurity";

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
    | "ignored";
  data?: any;
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
      console.error("❌ getConversationBetweenUsers:", error);
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
      console.error("❌ getConversation:", error);
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

      let typingStatus = null;
      try {
        typingStatus = await this.getTypingStatus(conversationId, otherUserId);
      } catch {
        // non-fatal
      }

      return {
        ...conversation,
        other_user: {
          id: otherUser.id,
          user_id: otherUser.user_id || otherUser.id,
          username: otherUser.username,
          display_name: otherUser.display_name,
          avatar_url: otherUser.avatar_url,
        },
        last_message: lastMessage,
        unread_count: unreadCount,
        is_online: typingStatus?.is_online || false,
        is_typing: typingStatus?.is_typing || false,
        typing_speed: typingStatus?.typing_speed,
      };
    } catch (error) {
      console.error("❌ getConversationWithUser:", error);
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
      console.error("❌ getConversationsForUser:", error);
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
      const participants: string[] = [];
      if (conversationData?.user1_id)
        participants.push(conversationData.user1_id);
      if (
        conversationData?.user2_id &&
        conversationData.user2_id !== conversationData.user1_id
      )
        participants.push(conversationData.user2_id);

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
      if (!resolvedRecipientId) {
        const conversationSnap = await getDoc(
          doc(db, "conversations", conversationId),
        );
        const conversationData = conversationSnap.exists()
          ? (conversationSnap.data() as Conversation)
          : null;
        resolvedRecipientId =
          conversationData?.user1_id === senderId
            ? conversationData?.user2_id
            : conversationData?.user1_id;
      }

      // Compute participants for rule-based DM privacy. Dedup in case of
      // self-conversations (shouldn't happen but be safe).
      const participants: string[] = [senderId];
      if (resolvedRecipientId && resolvedRecipientId !== senderId)
        participants.push(resolvedRecipientId);

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

      await setDoc(messageRef, data);

      if (!conversationId.startsWith("mock-")) {
        const conversationUpdates: Record<string, any> = {
          updated_at: serverTimestamp(),
          last_message_at: serverTimestamp(),
          last_message_content: content,
          [`unread_count_by_user.${senderId}`]: 0,
        };
        if (resolvedRecipientId) {
          conversationUpdates[`unread_count_by_user.${resolvedRecipientId}`] =
            increment(1);
        }
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

      await this.createMessageEvent({
        conversation_id: conversationId,
        user_id: senderId,
        event_type: "message_sent",
        data: { message_id: messageRef.id },
      });

      return message;
    } catch (error) {
      console.error("❌ sendMessageWithDelivery:", error);
      throw error;
    }
  }

  async getOlderMessages(
    conversationId: string,
    beforeCreatedAt: any,
    messageLimit = 50,
  ): Promise<MessageWithSender[]> {
    try {
      const q = query(
        collection(db, "messages"),
        where("conversation_id", "==", conversationId),
        where("created_at", "<", beforeCreatedAt),
        orderBy("created_at", "desc"),
        limit(messageLimit),
      );
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
      console.error("❌ getOlderMessages:", error);
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
      console.error("❌ getMessages:", error);
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
  ): Unsubscribe {
    // Fetch the latest messageLimit messages (DESC) so reads are bounded by
    // messageLimit, not conversation length. Reversed to present oldest-first.
    // For history beyond the limit use getOlderMessages().
    const q = query(
      collection(db, "messages"),
      where("conversation_id", "==", conversationId),
      orderBy("created_at", "desc"),
      limit(messageLimit),
    );

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

        const conversation: ConversationWithUser = {
          id,
          user1_id: data.user1_id,
          user2_id: data.user2_id,
          created_at:
            data.created_at?.toDate?.().toISOString() ?? data.created_at ?? "",
          updated_at:
            data.updated_at?.toDate?.().toISOString() ?? data.updated_at ?? "",
          last_message_at:
            data.last_message_at?.toDate?.().toISOString() ??
            data.last_message_at,
          last_message_content: data.last_message_content ?? "",
          other_user: {
            id: p.id,
            user_id: p.user_id || p.id,
            username: p.username ?? "",
            display_name: p.display_name ?? null,
            avatar_url: p.avatar_url ?? null,
          },
          unread_count: unreadCounts.get(id) ?? 0,
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

    const unsub1 = onSnapshot(q1, (snap) => {
      q1Docs.clear();
      snap.docs.forEach((d) => q1Docs.set(d.id, d.data()));
      rebuildAllDocs();
      q1Ready = true;
      scheduleProcess();
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      q2Docs.clear();
      snap.docs.forEach((d) => q2Docs.set(d.id, d.data()));
      rebuildAllDocs();
      q2Ready = true;
      scheduleProcess();
    });

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
    try {
      const typingRef = ref(realtimeDb, `typing/${conversationId}/${userId}`);
      set(typingRef, {
        is_typing: isTyping,
        typing_speed: typingSpeed || "normal",
        last_seen: new Date().toISOString(),
      });
      if (isTyping) {
        onDisconnect(typingRef).set({
          is_typing: false,
          typing_speed: "normal",
          last_seen: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("❌ setTypingIndicator:", error);
    }
  }

  // ── Live draft text (letter-by-letter real-time preview) ──────────────────

  /**
   * Write the current draft text to RTDB so the other user can see it live.
   * Path: drafts/{conversationId}/{userId}
   */
  setDraftText(conversationId: string, userId: string, text: string): void {
    try {
      const path = `drafts/${conversationId}/${userId}`;
      console.log("[draft service] Writing to RTDB path:", path, "text:", text);
      const draftRef = ref(realtimeDb, path);
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

  subscribeToConversationsTyping(
    conversationIds: string[],
    currentUserId: string,
    callback: (typingByConvId: Map<string, boolean>) => void,
  ): Unsubscribe {
    if (conversationIds.length === 0) return () => {};
    const typingMap = new Map<string, boolean>();
    const unsubscribes: Array<() => void> = [];

    conversationIds.forEach((convId) => {
      const typingRef = ref(realtimeDb, `typing/${convId}`);
      const unsub = onValue(typingRef, (snap) => {
        const data = snap.val() || {};
        const otherTyping = Object.entries(data).some(
          ([uid, val]) =>
            uid !== currentUserId && (val as any)?.is_typing === true,
        );
        typingMap.set(convId, otherTyping);
        callback(new Map(typingMap));
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }

  setOnlineStatus(userId: string, isOnline: boolean): void {
    try {
      const statusRef = ref(realtimeDb, `online_status/${userId}`);
      set(statusRef, {
        is_online: isOnline,
        last_seen: new Date().toISOString(),
      });
      if (isOnline) {
        onDisconnect(statusRef).set({
          is_online: false,
          last_seen: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("❌ setOnlineStatus:", error);
    }
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
    const typingRef = ref(realtimeDb, `typing/${conversationId}`);
    const unsub = onValue(typingRef, (snapshot) => {
      const data = snapshot.val() || {};
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
      callback(typingUsers);
    });
    return unsub;
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
  ): Unsubscribe {
    console.log(
      "[@mention service] Subscribing to events for conversation:",
      conversationId,
    );
    const q = query(
      collection(db, "message_events"),
      where("conversation_id", "==", conversationId),
      orderBy("created_at", "desc"),
      limit(50), // Keep last 50 events
    );

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
      console.error("❌ getLastMessage:", error);
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
      console.error("❌ getUnreadCount:", error);
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

    return [
      otherUserId || "",
      this.normalizeCacheTimestamp(data.updated_at),
      this.normalizeCacheTimestamp(data.last_message_at),
      data.last_message_content || "",
      typeof unreadCount === "number" ? unreadCount : "fallback",
    ].join("|");
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
      // Use server timestamp for more accurate timing
      const data = {
        ...eventData,
        created_at: serverTimestamp(),
      };
      await setDoc(eventRef, data);

      // Return with proper timestamp format
      const created_at = new Date().toISOString(); // Fallback for immediate return
      return { id: eventRef.id, ...eventData, created_at } as MessageEvent;
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
      console.error("❌ getUserProfile:", error);
      return null;
    }
  }
}

export const messagingService = new MessagingService();
