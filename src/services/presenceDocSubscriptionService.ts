import { db } from "@/backend/lib/firebase";
import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";

export interface PresenceDocSnapshotData {
  userId: string;
  isOnline: boolean;
  ghostMode: boolean;
  ghostModeExpiresAt: string | null;
  currentChatUserId: string;
  raw: Record<string, any>;
}

type Subscriber = (data: PresenceDocSnapshotData | null) => void;

interface SubscriptionEntry {
  firestoreUnsubscribe: Unsubscribe;
  subscribers: Set<Subscriber>;
  lastData: PresenceDocSnapshotData | null;
}

function normalizePresenceDocSnapshot(
  userId: string,
  raw: Record<string, any> | undefined,
): PresenceDocSnapshotData | null {
  if (!raw) return null;

  return {
    userId,
    isOnline: Boolean(raw.is_online),
    ghostMode: Boolean(raw.ghost_mode),
    ghostModeExpiresAt:
      typeof raw.ghost_mode_expires_at === "string"
        ? raw.ghost_mode_expires_at
        : raw.ghost_mode_expires_at?.toDate?.()?.toISOString?.() || null,
    currentChatUserId: String(raw.current_chat_user_id || ""),
    raw,
  };
}

class PresenceDocSubscriptionService {
  private subscriptions = new Map<string, SubscriptionEntry>();

  subscribe(userId: string, callback: Subscriber): () => void {
    if (!userId) {
      callback(null);
      return () => {};
    }

    let entry = this.subscriptions.get(userId);

    if (!entry) {
      const subscribers = new Set<Subscriber>();
      const firestoreUnsubscribe = onSnapshot(
        doc(db, "presence", userId),
        (docSnapshot) => {
          const nextEntry = this.subscriptions.get(userId);
          if (!nextEntry) return;

          nextEntry.lastData = docSnapshot.exists()
            ? normalizePresenceDocSnapshot(
                userId,
                docSnapshot.data() as Record<string, any>,
              )
            : null;

          nextEntry.subscribers.forEach((subscriber) =>
            subscriber(nextEntry.lastData),
          );
        },
        (error) => {
          console.error(
            `Error subscribing to shared presence doc for ${userId}:`,
            error,
          );
          const nextEntry = this.subscriptions.get(userId);
          nextEntry?.subscribers.forEach((subscriber) => subscriber(null));
        },
      );

      entry = {
        firestoreUnsubscribe,
        subscribers,
        lastData: null,
      };
      this.subscriptions.set(userId, entry);
    }

    entry.subscribers.add(callback);
    if (entry.lastData) {
      callback(entry.lastData);
    }

    return () => {
      const currentEntry = this.subscriptions.get(userId);
      if (!currentEntry) return;

      currentEntry.subscribers.delete(callback);
      if (currentEntry.subscribers.size === 0) {
        currentEntry.firestoreUnsubscribe();
        this.subscriptions.delete(userId);
      }
    };
  }
}

export const presenceDocSubscriptionService =
  new PresenceDocSubscriptionService();
