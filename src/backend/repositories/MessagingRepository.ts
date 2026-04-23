import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  IMessagingRepository,
  Conversation,
  Message,
  MessageEvent,
  TypingIndicator,
  CreateMessageRequest,
} from "@/backend/domain/interfaces/IMessagingRepository";

export class MessagingRepository implements IMessagingRepository {
  async getConversationById(
    conversationId: string,
  ): Promise<Conversation | null> {
    try {
      const conversationDocRef = doc(db, "conversations", conversationId);
      const conversationDoc = await getDoc(conversationDocRef);

      if (!conversationDoc.exists()) {
        return null;
      }

      const data = conversationDoc.data();
      return this.mapToConversation(data);
    } catch (error) {
      console.error("getConversationById error:", error);
      throw error;
    }
  }

  async getConversationBetweenUsers(
    user1Id: string,
    user2Id: string,
  ): Promise<Conversation | null> {
    try {
      const conversationQuery = query(
        collection(db, "conversations"),
        where("user1_id", "in", [user1Id, user2Id]),
        where("user2_id", "in", [user1Id, user2Id]),
      );

      const querySnapshot = await getDocs(conversationQuery);

      if (querySnapshot.empty) {
        return null;
      }

      const data = querySnapshot.docs[0].data();
      return this.mapToConversation(data);
    } catch (error) {
      console.error("getConversationBetweenUsers error:", error);
      throw error;
    }
  }

  async getConversationsForUser(userId: string): Promise<Conversation[]> {
    try {
      // Use two queries without orderBy to avoid index requirements
      const conversationsQuery = query(
        collection(db, "conversations"),
        where("user1_id", "==", userId),
      );

      const querySnapshot = await getDocs(conversationsQuery);
      const conversations: Conversation[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        conversations.push(this.mapToConversation(data));
      });

      const user2Query = query(
        collection(db, "conversations"),
        where("user2_id", "==", userId),
      );

      const user2Snapshot = await getDocs(user2Query);

      user2Snapshot.forEach((doc) => {
        const data = doc.data();
        conversations.push(this.mapToConversation(data));
      });

      // Sort in memory instead of requiring Firestore index
      conversations.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return conversations;
    } catch (error) {
      console.error("getConversationsForUser error:", error);
      throw error;
    }
  }

  async createConversation(
    user1Id: string,
    user2Id: string,
  ): Promise<Conversation> {
    try {
      const existingConversation = await this.getConversationBetweenUsers(
        user1Id,
        user2Id,
      );

      if (existingConversation) {
        return existingConversation;
      }

      const conversationRef = await addDoc(collection(db, "conversations"), {
        user1_id: user1Id,
        user2_id: user2Id,
        last_message_id: null,
        is_active: true,
        is_frozen: false,
        frozen_by: null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      const conversation = await this.getConversationById(conversationRef.id);
      if (!conversation) {
        throw new Error("Failed to create conversation");
      }
      return conversation;
    } catch (error) {
      console.error("createConversation error:", error);
      throw error;
    }
  }

  async updateConversation(
    conversationId: string,
    updates: Partial<Conversation>,
  ): Promise<Conversation> {
    try {
      const conversationRef = doc(db, "conversations", conversationId);

      const firestoreUpdates: any = {
        updated_at: serverTimestamp(),
      };

      if (updates.lastMessageId !== undefined) {
        firestoreUpdates.last_message_id = updates.lastMessageId;
      }
      if (updates.isActive !== undefined) {
        firestoreUpdates.is_active = updates.isActive;
      }
      if (updates.isFrozen !== undefined) {
        firestoreUpdates.is_frozen = updates.isFrozen;
      }
      if (updates.frozenBy !== undefined) {
        firestoreUpdates.frozen_by = updates.frozenBy;
      }

      await updateDoc(conversationRef, firestoreUpdates);

      const updatedConversation =
        await this.getConversationById(conversationId);
      if (!updatedConversation) {
        throw new Error("Conversation not found after update");
      }

      return updatedConversation;
    } catch (error) {
      console.error("updateConversation error:", error);
      throw error;
    }
  }

  async freezeConversation(
    conversationId: string,
    frozenBy: string,
  ): Promise<Conversation> {
    return this.updateConversation(conversationId, {
      isFrozen: true,
      frozenBy,
    });
  }

  async unfreezeConversation(conversationId: string): Promise<Conversation> {
    return this.updateConversation(conversationId, {
      isFrozen: false,
      frozenBy: null,
    });
  }

  async getMessagesByConversationId(
    conversationId: string,
    limitCount: number = 50,
  ): Promise<Message[]> {
    try {
      const messagesQuery = query(
        collection(db, "messages"),
        where("conversation_id", "==", conversationId),
        orderBy("created_at", "desc"),
        limit(limitCount),
      );

      const querySnapshot = await getDocs(messagesQuery);
      const messages: Message[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        messages.push(this.mapToMessage(data));
      });

      return messages.reverse();
    } catch (error) {
      console.error("getMessagesByConversationId error:", error);
      throw error;
    }
  }

  async getMessageById(messageId: string): Promise<Message | null> {
    try {
      const messageDocRef = doc(db, "messages", messageId);
      const messageDoc = await getDoc(messageDocRef);

      if (!messageDoc.exists()) {
        return null;
      }

      const data = messageDoc.data();
      return this.mapToMessage(data);
    } catch (error) {
      console.error("getMessageById error:", error);
      throw error;
    }
  }

  async createMessage(request: CreateMessageRequest): Promise<Message> {
    try {
      // Look up the conversation participants once and stamp them onto the
      // message doc. This lets Firestore rules gate reads on
      // `auth.uid in resource.data.participants` without a cross-doc get()
      // per message, which is much cheaper for listeners and makes DM
      // privacy enforceable.
      const convSnap = await getDoc(
        doc(db, "conversations", request.conversationId),
      );
      if (!convSnap.exists()) {
        throw new Error("Conversation not found");
      }
      const conv = convSnap.data() as any;
      const participants: string[] = [];
      if (conv.user1_id) participants.push(conv.user1_id);
      if (conv.user2_id && conv.user2_id !== conv.user1_id)
        participants.push(conv.user2_id);

      const messageRef = await addDoc(collection(db, "messages"), {
        conversation_id: request.conversationId,
        sender_id: request.senderId,
        participants,
        content: request.content,
        media_url: request.mediaUrl || null,
        media_type: request.mediaType || "TEXT",
        is_delivered: false,
        is_seen: false,
        created_at: serverTimestamp(),
      });

      const message = await this.getMessageById(messageRef.id);
      if (!message) {
        throw new Error("Failed to create message");
      }

      await this.updateConversation(request.conversationId, {
        lastMessageId: messageRef.id,
      });

      return message;
    } catch (error) {
      console.error("createMessage error:", error);
      throw error;
    }
  }

  async updateMessage(
    messageId: string,
    updates: Partial<Message>,
  ): Promise<Message> {
    try {
      const messageRef = doc(db, "messages", messageId);

      const firestoreUpdates: any = {};

      if (updates.isDelivered !== undefined) {
        firestoreUpdates.is_delivered = updates.isDelivered;
      }
      if (updates.isSeen !== undefined) {
        firestoreUpdates.is_seen = updates.isSeen;
      }

      await updateDoc(messageRef, firestoreUpdates);

      const updatedMessage = await this.getMessageById(messageId);
      if (!updatedMessage) {
        throw new Error("Message not found after update");
      }

      return updatedMessage;
    } catch (error) {
      console.error("updateMessage error:", error);
      throw error;
    }
  }

  async markMessageAsDelivered(messageId: string): Promise<Message> {
    return this.updateMessage(messageId, { isDelivered: true });
  }

  async markMessageAsSeen(messageId: string, userId: string): Promise<Message> {
    const message = await this.updateMessage(messageId, { isSeen: true });

    await this.createMessageEvent({
      messageId,
      eventType: "seen",
      userId,
      eventData: { seen_at: new Date().toISOString() },
    });

    return message;
  }

  async createMessageEvent(
    event: Omit<MessageEvent, "id" | "createdAt">,
  ): Promise<MessageEvent> {
    try {
      const eventRef = await addDoc(collection(db, "message_events"), {
        message_id: event.messageId,
        event_type: event.eventType,
        user_id: event.userId,
        event_data: event.eventData,
        created_at: serverTimestamp(),
      });

      const createdEvent = await this.getMessageEventById(eventRef.id);
      if (!createdEvent) {
        throw new Error("Failed to create message event");
      }
      return createdEvent;
    } catch (error) {
      console.error("createMessageEvent error:", error);
      throw error;
    }
  }

  async getMessageEvents(messageId: string): Promise<MessageEvent[]> {
    try {
      const eventsQuery = query(
        collection(db, "message_events"),
        where("message_id", "==", messageId),
        orderBy("created_at", "desc"),
      );

      const querySnapshot = await getDocs(eventsQuery);
      const events: MessageEvent[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        events.push(this.mapToMessageEvent(data));
      });

      return events;
    } catch (error) {
      console.error("getMessageEvents error:", error);
      throw error;
    }
  }

  async setTypingIndicator(
    conversationId: string,
    userId: string,
    speed: "slow" | "normal" | "fast" | "furious",
  ): Promise<TypingIndicator> {
    try {
      const existingIndicatorQuery = query(
        collection(db, "typing_indicators"),
        where("conversation_id", "==", conversationId),
        where("user_id", "==", userId),
      );

      const existingSnapshot = await getDocs(existingIndicatorQuery);

      if (!existingSnapshot.empty) {
        const existingDoc = existingSnapshot.docs[0];
        await updateDoc(existingDoc.ref, {
          typing_speed: speed,
          started_at: serverTimestamp(),
        });

        const updatedIndicator = await this.getTypingIndicatorById(
          existingDoc.id,
        );
        if (!updatedIndicator) {
          throw new Error("Typing indicator not found after update");
        }
        return updatedIndicator;
      } else {
        const indicatorRef = await addDoc(collection(db, "typing_indicators"), {
          conversation_id: conversationId,
          user_id: userId,
          typing_speed: speed,
          started_at: serverTimestamp(),
        });

        const indicator = await this.getTypingIndicatorById(indicatorRef.id);
        if (!indicator) {
          throw new Error("Failed to create typing indicator");
        }
        return indicator;
      }
    } catch (error) {
      console.error("setTypingIndicator error:", error);
      throw error;
    }
  }

  async clearTypingIndicator(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    try {
      const indicatorQuery = query(
        collection(db, "typing_indicators"),
        where("conversation_id", "==", conversationId),
        where("user_id", "==", userId),
      );

      const querySnapshot = await getDocs(indicatorQuery);

      const deletePromises = querySnapshot.docs.map((doc) =>
        deleteDoc(doc.ref),
      );
      await Promise.all(deletePromises);
    } catch (error) {
      console.error("clearTypingIndicator error:", error);
      throw error;
    }
  }

  async getTypingIndicators(
    conversationId: string,
  ): Promise<TypingIndicator[]> {
    try {
      const indicatorsQuery = query(
        collection(db, "typing_indicators"),
        where("conversation_id", "==", conversationId),
        orderBy("started_at", "desc"),
      );

      const querySnapshot = await getDocs(indicatorsQuery);
      const indicators: TypingIndicator[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        indicators.push(this.mapToTypingIndicator(data));
      });

      return indicators;
    } catch (error) {
      console.error("getTypingIndicators error:", error);
      throw error;
    }
  }

  private async getMessageEventById(
    eventId: string,
  ): Promise<MessageEvent | null> {
    try {
      const eventDocRef = doc(db, "message_events", eventId);
      const eventDoc = await getDoc(eventDocRef);

      if (!eventDoc.exists()) {
        return null;
      }

      const data = eventDoc.data();
      return this.mapToMessageEvent(data);
    } catch (error) {
      console.error("getMessageEventById error:", error);
      return null;
    }
  }

  private async getTypingIndicatorById(
    indicatorId: string,
  ): Promise<TypingIndicator | null> {
    try {
      const indicatorDocRef = doc(db, "typing_indicators", indicatorId);
      const indicatorDoc = await getDoc(indicatorDocRef);

      if (!indicatorDoc.exists()) {
        return null;
      }

      const data = indicatorDoc.data();
      return this.mapToTypingIndicator(data);
    } catch (error) {
      console.error("getTypingIndicatorById error:", error);
      return null;
    }
  }

  private mapToConversation(data: any): Conversation {
    return {
      id: data.id || "",
      user1Id: data.user1_id,
      user2Id: data.user2_id,
      lastMessageId: data.last_message_id,
      isActive: data.is_active,
      isFrozen: data.is_frozen,
      frozenBy: data.frozen_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  private mapToMessage(data: any): Message {
    return {
      id: data.id || "",
      conversationId: data.conversation_id,
      senderId: data.sender_id,
      content: data.content,
      mediaUrl: data.media_url,
      mediaType: data.media_type,
      isDelivered: data.is_delivered,
      isSeen: data.is_seen,
      createdAt: data.created_at,
    };
  }

  private mapToMessageEvent(data: any): MessageEvent {
    return {
      id: data.id || "",
      messageId: data.message_id,
      eventType: data.event_type,
      userId: data.user_id,
      eventData: data.event_data,
      createdAt: data.created_at,
    };
  }

  private mapToTypingIndicator(data: any): TypingIndicator {
    return {
      id: data.id || "",
      conversationId: data.conversation_id,
      userId: data.user_id,
      typingSpeed: data.typing_speed,
      startedAt: data.started_at,
    };
  }
}
