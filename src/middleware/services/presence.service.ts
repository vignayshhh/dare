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
  deleteDoc,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import {
  ref,
  push,
  remove,
  onValue,
  off,
  update,
  get,
  set,
} from "firebase/database";

export interface Presence {
  id: string;
  user_id: string;
  is_online: boolean;
  last_seen: string;
  current_activity?: "active" | "away" | "busy";
}

export interface ScreenshotEvent {
  id: string;
  user_id: string;
  target_user_id?: string;
  screen_content?: string;
  timestamp: string;
  event_type: "screenshot" | "screen_capture_attempt";
}

class PresenceService {
  async updatePresence(
    userId: string,
    isOnline: boolean,
    activity?: "active" | "away" | "busy",
  ): Promise<void> {
    try {
      const presenceRef = doc(db, "presence", userId);
      const presenceData = {
        user_id: userId,
        is_online: isOnline,
        last_seen: new Date().toISOString(),
        current_activity: activity || "active",
      };

      await setDoc(presenceRef, presenceData, { merge: true });

      const realtimePresenceRef = ref(realtimeDb, `presence/${userId}`);
      await set(realtimePresenceRef, {
        is_online: isOnline,
        last_seen: serverTimestamp(),
        current_activity: activity || "active",
      });
    } catch (error) {
      console.error("Error updating presence:", error);
    }
  }

  async getPresence(userId: string): Promise<Presence | null> {
    try {
      const presenceDocRef = doc(db, "presence", userId);
      const presenceDoc = await getDoc(presenceDocRef);

      if (!presenceDoc.exists()) return null;
      return { id: presenceDoc.id, ...presenceDoc.data() } as Presence;
    } catch (error) {
      console.error("Error getting presence:", error);
      return null;
    }
  }

  async getFriendsPresence(userId: string): Promise<Presence[]> {
    try {
      const presenceRef = collection(db, "presence");
      const q = query(presenceRef, where("is_online", "==", true));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Presence[];
    } catch (error) {
      console.error("Error getting friends presence:", error);
      return [];
    }
  }

  subscribeToPresence(
    userId: string,
    callback: (presence: Presence) => void,
  ): () => void {
    const presenceRef = doc(db, "presence", userId);

    const unsubscribe = onSnapshot(presenceRef, (doc) => {
      if (doc.exists()) {
        const presence = { id: doc.id, ...doc.data() } as Presence;
        callback(presence);
      }
    });

    return unsubscribe;
  }

  subscribeToFriendsPresence(
    userId: string,
    callback: (presence: Presence[]) => void,
  ): () => void {
    const realtimePresenceRef = ref(realtimeDb, "presence");

    const listener = onValue(realtimePresenceRef, (snapshot) => {
      const presenceData = snapshot.val() || {};
      const presenceList: Presence[] = [];

      for (const uid in presenceData) {
        const data = presenceData[uid];
        presenceList.push({
          id: uid,
          user_id: uid,
          is_online: data.is_online,
          last_seen: data.last_seen,
          current_activity: data.current_activity,
        });
      }

      callback(presenceList.filter((p) => p.is_online));
    });

    return () => off(realtimePresenceRef, "value", listener);
  }

  async recordScreenshotEvent(
    userId: string,
    targetUserId?: string,
    screenContent?: string,
  ): Promise<ScreenshotEvent> {
    try {
      const screenshotRef = doc(collection(db, "screenshot_events"));
      const screenshotData = {
        user_id: userId,
        target_user_id: targetUserId || null,
        screen_content: screenContent || null,
        timestamp: new Date().toISOString(),
        event_type: "screenshot",
      };

      await setDoc(screenshotRef, screenshotData);
      return { id: screenshotRef.id, ...screenshotData } as ScreenshotEvent;
    } catch (error) {
      console.error("Error recording screenshot event:", error);
      throw error;
    }
  }

  async recordScreenCaptureAttempt(
    userId: string,
    targetUserId?: string,
  ): Promise<ScreenshotEvent> {
    try {
      const screenshotRef = doc(collection(db, "screenshot_events"));
      const screenshotData = {
        user_id: userId,
        target_user_id: targetUserId || null,
        screen_content: undefined,
        timestamp: new Date().toISOString(),
        event_type: "screen_capture_attempt",
      };

      await setDoc(screenshotRef, screenshotData);
      return { id: screenshotRef.id, ...screenshotData } as ScreenshotEvent;
    } catch (error) {
      console.error("Error recording screen capture attempt:", error);
      throw error;
    }
  }

  async getScreenshotEvents(
    userId: string,
    limitCount: number = 50,
  ): Promise<ScreenshotEvent[]> {
    try {
      const screenshotsRef = collection(db, "screenshot_events");
      const q = query(
        screenshotsRef,
        where("user_id", "==", userId),
        orderBy("timestamp", "desc"),
        limit(limitCount),
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ScreenshotEvent[];
    } catch (error) {
      console.error("Error getting screenshot events:", error);
      return [];
    }
  }

  subscribeToScreenshotEvents(
    userId: string,
    callback: (events: ScreenshotEvent[]) => void,
  ): () => void {
    const screenshotsRef = query(
      collection(db, "screenshot_events"),
      where("user_id", "==", userId),
      orderBy("timestamp", "desc"),
      limit(100),
    );

    const unsubscribe = onSnapshot(screenshotsRef, (querySnapshot) => {
      const events: ScreenshotEvent[] = [];
      querySnapshot.forEach((doc) => {
        events.push({ id: doc.id, ...doc.data() } as ScreenshotEvent);
      });
      callback(events);
    });

    return unsubscribe;
  }

  async cleanupOfflinePresence(): Promise<void> {
    try {
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

      const presenceRef = collection(db, "presence");
      const q = query(
        presenceRef,
        where("is_online", "==", true),
        where("last_seen", "<", fiveMinutesAgo.toISOString()),
      );
      const querySnapshot = await getDocs(q);

      for (const doc of querySnapshot.docs) {
        await updateDoc(doc.ref, {
          is_online: false,
          current_activity: "away",
        });
      }
    } catch (error) {
      console.error("Error cleaning up offline presence:", error);
    }
  }

  async setUserActivity(
    userId: string,
    activity: "active" | "away" | "busy",
  ): Promise<void> {
    try {
      const presenceRef = doc(db, "presence", userId);
      await updateDoc(presenceRef, {
        current_activity: activity,
        last_seen: new Date().toISOString(),
      });

      const realtimePresenceRef = ref(realtimeDb, `presence/${userId}`);
      await update(realtimePresenceRef, {
        current_activity: activity,
        last_seen: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error setting user activity:", error);
    }
  }
}

export const presenceService = new PresenceService();
