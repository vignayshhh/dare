import { db } from "@/backend/lib/firebase";
import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";

export interface UserDocSnapshotData {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  raw: Record<string, any>;
}

type Subscriber = (data: UserDocSnapshotData | null) => void;

interface SubscriptionEntry {
  firestoreUnsubscribe: Unsubscribe;
  subscribers: Set<Subscriber>;
  lastData: UserDocSnapshotData | null;
}

function normalizeUserDocSnapshot(
  userId: string,
  raw: Record<string, any> | undefined,
): UserDocSnapshotData | null {
  if (!raw) return null;

  return {
    userId,
    displayName:
      raw.displayName || raw.display_name || raw.nickname || raw.username || "",
    username: raw.username || "",
    avatarUrl: raw.avatar || raw.avatarUrl || raw.avatar_url || "",
    raw,
  };
}

class UserDocSubscriptionService {
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
        doc(db, "users", userId),
        (docSnapshot) => {
          const nextEntry = this.subscriptions.get(userId);
          if (!nextEntry) return;

          nextEntry.lastData = docSnapshot.exists()
            ? normalizeUserDocSnapshot(
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
            `Error subscribing to shared user doc for ${userId}:`,
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

export const userDocSubscriptionService = new UserDocSubscriptionService();
