import { db } from "@/backend/lib/firebase";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";

export type ChallengeRoomChatMessage = {
  id: string;
  challengeId: string;
  senderId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  createdAtMs: number;
};

type SendRoomMessageInput = {
  challengeId: string;
  senderId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  content: string;
};

const ROOM_MESSAGE_LIMIT = 80;

const normalizeUsername = (value: string | undefined) =>
  (value || "dareuser").replace(/^@/, "").trim().slice(0, 40) || "dareuser";

const normalizeDisplayName = (displayName: string | undefined, username: string) =>
  (displayName || username || "Dare User").trim().slice(0, 80) || "Dare User";

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string") return new Date(value).getTime() || null;
  return null;
};

const normalizeMessage = (
  id: string,
  data: any,
): ChallengeRoomChatMessage | null => {
  const content = String(data?.content || "").trim();
  const senderId = String(data?.sender_id || "");
  const challengeId = String(data?.challenge_id || "");
  if (!content || !senderId || !challengeId) return null;

  const username = normalizeUsername(data?.username);
  const displayName = normalizeDisplayName(data?.display_name, username);

  return {
    id,
    challengeId,
    senderId,
    username,
    displayName,
    avatarUrl: String(data?.avatar_url || ""),
    content: content.slice(0, 700),
    createdAtMs:
      toMillis(data?.client_created_at) || toMillis(data?.created_at) || Date.now(),
  };
};

class ChallengeRoomChatService {
  subscribeToMessages(
    challengeId: string | undefined,
    callback: (messages: ChallengeRoomChatMessage[]) => void,
    onError?: (message: string) => void,
  ): Unsubscribe {
    if (!challengeId) {
      callback([]);
      return () => {};
    }

    const messagesQuery = query(
      collection(db, "community_challenge_rooms", challengeId, "messages"),
      orderBy("client_created_at", "desc"),
      limit(ROOM_MESSAGE_LIMIT),
    );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        callback(
          snapshot.docs
            .map((messageDoc) =>
              normalizeMessage(messageDoc.id, messageDoc.data()),
            )
            .filter(
              (message): message is ChallengeRoomChatMessage =>
                message !== null,
            )
            .sort((a, b) => a.createdAtMs - b.createdAtMs),
        );
        onError?.("");
      },
      (error: FirestoreError) => {
        console.warn("Community room chat unavailable:", error.code);
        callback([]);
        onError?.(
          error.code === "permission-denied"
            ? "Only current members can open this room chat."
            : "Room chat is unavailable right now.",
        );
      },
    );
  }

  async sendMessage(input: SendRoomMessageInput) {
    const content = input.content.trim();
    if (!input.challengeId || !input.senderId) {
      return { success: false, error: "You must be signed in to chat." };
    }
    if (!content) {
      return { success: false, error: "Write a message first." };
    }
    if (content.length > 700) {
      return { success: false, error: "Keep room messages under 700 characters." };
    }

    try {
      const username = normalizeUsername(input.username);
      const displayName = normalizeDisplayName(input.displayName, username);
      const messageRef = doc(
        collection(
          db,
          "community_challenge_rooms",
          input.challengeId,
          "messages",
        ),
      );

      await setDoc(messageRef, {
        challenge_id: input.challengeId,
        sender_id: input.senderId,
        username,
        display_name: displayName,
        avatar_url: input.avatarUrl || "",
        content,
        client_created_at: Date.now(),
        created_at: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.warn("Failed to send community room message:", error);
      return { success: false, error: "Could not send message. Try again." };
    }
  }
}

export const challengeRoomChatService = new ChallengeRoomChatService();
