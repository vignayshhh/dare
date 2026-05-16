import { db } from "@/backend/lib/firebase";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { resolveUserProfile } from "@/utils/profileResolver";

export type ChatInviteStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "removed"
  | "left";

export interface ChatInvite {
  id: string;
  conversation_id: string;
  inviter_id: string;
  inviter_name: string;
  invitee_id: string;
  invitee_name: string;
  original_participant_ids: string[];
  status: ChatInviteStatus;
  created_at: string;
  updated_at: string;
  joined_at?: string | null;
  entered_at?: string | null;
  ended_at?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function inviteDocId(conversationId: string, inviteeId: string): string {
  return `${conversationId}_${inviteeId}`;
}

function getOriginalParticipantIds(conversation: any): string[] {
  return [conversation?.user1_id, conversation?.user2_id].filter(Boolean);
}

async function createInviteEvent(
  conversationId: string,
  userId: string,
  action: "invited" | "joined" | "removed" | "left",
  participant: { userId: string; name: string },
  participants: string[],
): Promise<void> {
  const eventRef = doc(collection(db, "message_events"));
  await setDoc(eventRef, {
    conversation_id: conversationId,
    user_id: userId,
    event_type: "invite",
    participants: [...new Set(participants)],
    data: {
      action,
      user_id: participant.userId,
      user_name: participant.name,
    },
    created_at: nowIso(),
  });
}

class ChatInviteService {
  subscribeReceivedInvites(
    userId: string,
    callback: (invites: ChatInvite[]) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, "chat_invites"),
      where("invitee_id", "==", userId),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const invites = snapshot.docs
          .map((inviteDoc) => ({
            id: inviteDoc.id,
            ...inviteDoc.data(),
          })) as ChatInvite[];
        invites.sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime(),
        );
        callback(invites);
      },
      (error) => {
        console.error("Unable to subscribe to received chat invites:", error);
        callback([]);
      },
    );
  }

  subscribeConversationInvites(
    conversationId: string,
    userId: string,
    isOriginalParticipant: boolean,
    inviteeIds: string[],
    callback: (invites: ChatInvite[]) => void,
  ): Unsubscribe {
    const targetInviteeIds = isOriginalParticipant ? inviteeIds : [userId];
    const uniqueInviteeIds = [...new Set(targetInviteeIds.filter(Boolean))];

    if (uniqueInviteeIds.length === 0) {
      callback([]);
      return () => {};
    }

    const byId = new Map<string, ChatInvite>();
    let readyCount = 0;
    let hasEmittedReady = false;

    const emit = () => {
      if (!hasEmittedReady && readyCount < uniqueInviteeIds.length) return;
      hasEmittedReady = true;
      callback([...byId.values()]);
    };

    const unsubscribes = uniqueInviteeIds.map((inviteeId) => {
      const id = inviteDocId(conversationId, inviteeId);
      return onSnapshot(
        doc(db, "chat_invites", id),
        (snapshot) => {
          if (!hasEmittedReady) readyCount += 1;
          if (snapshot.exists()) {
            byId.set(id, { id: snapshot.id, ...snapshot.data() } as ChatInvite);
          } else {
            byId.delete(id);
          }
          emit();
        },
        (error) => {
          if (!hasEmittedReady) readyCount += 1;
          byId.delete(id);
          console.error("Unable to subscribe to conversation chat invite:", error);
          emit();
        },
      );
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  async sendInvite(request: {
    conversationId: string;
    inviterId: string;
    inviterName: string;
    inviteeId: string;
    inviteeName: string;
  }): Promise<void> {
    const conversationRef = doc(db, "conversations", request.conversationId);
    const conversationSnap = await getDoc(conversationRef);
    if (!conversationSnap.exists()) {
      throw new Error("Conversation not found");
    }

    const conversation = conversationSnap.data();
    const originalParticipantIds = getOriginalParticipantIds(conversation);
    if (!originalParticipantIds.includes(request.inviterId)) {
      throw new Error("Only the original chat members can invite friends");
    }
    if (originalParticipantIds.includes(request.inviteeId)) {
      throw new Error("That user is already in this conversation");
    }

    const id = inviteDocId(request.conversationId, request.inviteeId);
    const inviteRef = doc(db, "chat_invites", id);
    const existing = await getDoc(inviteRef);
    const existingStatus = existing.exists()
      ? String(existing.data()?.status || "")
      : "";
    if (existingStatus === "pending" || existingStatus === "accepted") {
      throw new Error("This friend already has an active invite");
    }

    const timestamp = nowIso();
    await setDoc(inviteRef, {
      conversation_id: request.conversationId,
      inviter_id: request.inviterId,
      inviter_name: request.inviterName,
      invitee_id: request.inviteeId,
      invitee_name: request.inviteeName,
      original_participant_ids: originalParticipantIds,
      status: "pending",
      created_at: timestamp,
      updated_at: timestamp,
      joined_at: null,
      entered_at: null,
      ended_at: null,
    });

    await createInviteEvent(
      request.conversationId,
      request.inviterId,
      "invited",
      { userId: request.inviteeId, name: request.inviteeName },
      originalParticipantIds,
    );
  }

  async acceptInvite(inviteId: string, userId: string): Promise<void> {
    const inviteRef = doc(db, "chat_invites", inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error("Invite not found");

    const invite = { id: inviteSnap.id, ...inviteSnap.data() } as ChatInvite;
    if (invite.invitee_id !== userId) {
      throw new Error("You can only accept invites sent to you");
    }
    if (invite.status !== "pending") {
      throw new Error("This invite is no longer pending");
    }

    const timestamp = nowIso();
    const batch = writeBatch(db);
    batch.update(inviteRef, {
      status: "accepted",
      joined_at: timestamp,
      ended_at: null,
      updated_at: timestamp,
    });
    batch.update(doc(db, "conversations", invite.conversation_id), {
      temporary_participant_ids: arrayUnion(userId),
      updated_at: timestamp,
    });
    await batch.commit();
  }

  async markInviteEntered(inviteId: string, userId: string): Promise<void> {
    const inviteRef = doc(db, "chat_invites", inviteId);
    const timestamp = nowIso();
    const eventInvites: ChatInvite[] = [];

    await runTransaction(db, async (transaction) => {
      const inviteSnap = await transaction.get(inviteRef);
      if (!inviteSnap.exists()) throw new Error("Invite not found");

      const invite = { id: inviteSnap.id, ...inviteSnap.data() } as ChatInvite;
      if (invite.invitee_id !== userId) {
        throw new Error("You can only enter invites sent to you");
      }
      if (invite.status !== "accepted" || invite.entered_at) {
        return;
      }

      eventInvites.push(invite);
      transaction.update(inviteRef, {
        entered_at: timestamp,
        updated_at: timestamp,
      });
    });

    const inviteForEvent = eventInvites[0];
    if (!inviteForEvent) return;

    await createInviteEvent(
      inviteForEvent.conversation_id,
      userId,
      "joined",
      { userId, name: inviteForEvent.invitee_name || "Someone" },
      [...inviteForEvent.original_participant_ids, userId],
    );
  }

  async rejectInvite(inviteId: string, userId: string): Promise<void> {
    const inviteRef = doc(db, "chat_invites", inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error("Invite not found");
    const invite = inviteSnap.data() as ChatInvite;
    if (invite.invitee_id !== userId) {
      throw new Error("You can only reject invites sent to you");
    }

    await updateDoc(inviteRef, {
      status: "rejected",
      ended_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  async endTemporaryAccess(request: {
    inviteId: string;
    actorId: string;
    action: "removed" | "left";
  }): Promise<void> {
    const inviteRef = doc(db, "chat_invites", request.inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error("Invite not found");

    const invite = { id: inviteSnap.id, ...inviteSnap.data() } as ChatInvite;
    const isOriginal = invite.original_participant_ids.includes(request.actorId);
    const isInvitee = invite.invitee_id === request.actorId;

    if (request.action === "left" && !isInvitee) {
      throw new Error("Only the invited friend can leave");
    }
    if (request.action === "removed" && !isOriginal) {
      throw new Error("Only original chat members can remove guests");
    }
    if (invite.status !== "accepted") {
      return;
    }

    await createInviteEvent(
      invite.conversation_id,
      request.actorId,
      request.action,
      { userId: invite.invitee_id, name: invite.invitee_name || "Someone" },
      [...invite.original_participant_ids, invite.invitee_id],
    );

    const timestamp = nowIso();
    const batch = writeBatch(db);
    batch.update(inviteRef, {
      status: request.action,
      ended_at: timestamp,
      updated_at: timestamp,
    });
    batch.update(doc(db, "conversations", invite.conversation_id), {
      temporary_participant_ids: arrayRemove(invite.invitee_id),
      updated_at: timestamp,
    });
    await batch.commit();
  }

  async getConversationForUser(conversationId: string, userId: string) {
    const conversationSnap = await getDoc(doc(db, "conversations", conversationId));
    if (!conversationSnap.exists()) return null;

    const data = conversationSnap.data();
    const originalParticipantIds = getOriginalParticipantIds(data);
    const temporaryParticipantIds = Array.isArray(data.temporary_participant_ids)
      ? data.temporary_participant_ids
      : [];
    const canAccess =
      originalParticipantIds.includes(userId) ||
      temporaryParticipantIds.includes(userId);
    if (!canAccess) return null;

    const otherOriginalIds = originalParticipantIds.filter((id) => id !== userId);
    const profiles = await Promise.all(
      otherOriginalIds.map((id) => resolveUserProfile(id)),
    );
    const names = profiles.map((profile, index) => {
      const fallbackId = otherOriginalIds[index];
      return (
        profile?.displayName ||
        profile?.display_name ||
        profile?.username ||
        `user_${fallbackId.slice(-6)}`
      );
    });

    return {
      id: conversationSnap.id,
      user1_id: data.user1_id,
      user2_id: data.user2_id,
      temporary_participant_ids: temporaryParticipantIds,
      created_at: data.created_at?.toDate?.().toISOString?.() || data.created_at || "",
      updated_at: data.updated_at?.toDate?.().toISOString?.() || data.updated_at || "",
      last_message_at:
        data.last_message_at?.toDate?.().toISOString?.() || data.last_message_at || "",
      last_message_content: data.last_message_content || "",
      cleared_at: data.cleared_at_by_user?.[userId] || data.cleared_at || null,
      unread_count: data.unread_count_by_user?.[userId] || 0,
      is_online: false,
      is_typing: false,
      other_user: {
        id: "",
        user_id: "",
        username: "temporary_chat",
        display_name: names.length > 0 ? names.join(" and ") : "Temporary chat",
        avatar_url: null,
      },
    };
  }
}

export const chatInviteService = new ChatInviteService();
