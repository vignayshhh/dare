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
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  IPresenceRepository,
  Presence,
  UpdatePresenceRequest,
} from "@/backend/domain/interfaces/IPresenceRepository";

export class PresenceRepository implements IPresenceRepository {
  async getPresenceByUserId(userId: string): Promise<Presence | null> {
    try {
      const presenceDocRef = doc(db, "presence", userId);
      const presenceDoc = await getDoc(presenceDocRef);

      if (!presenceDoc.exists()) {
        return null;
      }

      const data = presenceDoc.data();
      return this.mapToPresence(data);
    } catch (error) {
      console.error("getPresenceByUserId error:", error);
      throw error;
    }
  }

  async updatePresence(
    userId: string,
    updates: UpdatePresenceRequest,
  ): Promise<Presence> {
    try {
      const presenceRef = doc(db, "presence", userId);

      const firestoreUpdates: any = {
        updated_at: serverTimestamp(),
      };

      if (updates.isOnline !== undefined) {
        firestoreUpdates.is_online = updates.isOnline;
        firestoreUpdates.last_seen = updates.isOnline
          ? serverTimestamp()
          : new Date().toISOString();
      }
      if (updates.currentProfileViewing !== undefined) {
        firestoreUpdates.current_profile_viewing =
          updates.currentProfileViewing;
      }
      if (updates.typingInChatWith !== undefined) {
        firestoreUpdates.typing_in_chat_with = updates.typingInChatWith;
      }
      if (updates.ghostMode !== undefined) {
        firestoreUpdates.ghost_mode = updates.ghostMode;
      }

      await updateDoc(presenceRef, firestoreUpdates);

      const updatedPresence = await this.getPresenceByUserId(userId);
      if (!updatedPresence) {
        throw new Error("Presence not found after update");
      }

      return updatedPresence;
    } catch (error) {
      console.error("updatePresence error:", error);
      throw error;
    }
  }

  async setOnlineStatus(userId: string, isOnline: boolean): Promise<Presence> {
    return this.updatePresence(userId, { isOnline });
  }

  async setCurrentProfileViewing(
    userId: string,
    profileId: string,
  ): Promise<Presence> {
    return this.updatePresence(userId, { currentProfileViewing: profileId });
  }

  async setTypingInChat(userId: string, chatUserId: string): Promise<Presence> {
    return this.updatePresence(userId, { typingInChatWith: chatUserId });
  }

  async clearTypingInChat(userId: string): Promise<Presence> {
    return this.updatePresence(userId, { typingInChatWith: undefined });
  }

  async setGhostMode(userId: string, ghostMode: boolean): Promise<Presence> {
    return this.updatePresence(userId, { ghostMode });
  }

  async getOnlineUsers(): Promise<Presence[]> {
    try {
      const onlineUsersQuery = query(
        collection(db, "presence"),
        where("is_online", "==", true),
        orderBy("last_seen", "desc"),
      );

      const querySnapshot = await getDocs(onlineUsersQuery);
      const onlineUsers: Presence[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        onlineUsers.push(this.mapToPresence(data));
      });

      return onlineUsers;
    } catch (error) {
      console.error("getOnlineUsers error:", error);
      throw error;
    }
  }

  async getUsersViewingProfile(profileId: string): Promise<Presence[]> {
    try {
      const viewersQuery = query(
        collection(db, "presence"),
        where("current_profile_viewing", "==", profileId),
        where("is_online", "==", true),
        orderBy("last_seen", "desc"),
      );

      const querySnapshot = await getDocs(viewersQuery);
      const viewers: Presence[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        viewers.push(this.mapToPresence(data));
      });

      return viewers;
    } catch (error) {
      console.error("getUsersViewingProfile error:", error);
      throw error;
    }
  }

  async ensurePresenceExists(userId: string): Promise<Presence> {
    try {
      const existingPresence = await this.getPresenceByUserId(userId);

      if (existingPresence) {
        return existingPresence;
      }

      const presenceRef = doc(db, "presence", userId);
      await setDoc(presenceRef, {
        user_id: userId,
        is_online: false,
        last_seen: new Date().toISOString(),
        current_profile_viewing: null,
        typing_in_chat_with: null,
        ghost_mode: false,
        updated_at: serverTimestamp(),
      });

      const presence = await this.getPresenceByUserId(userId);
      if (!presence) {
        throw new Error("Failed to create presence");
      }
      return presence;
    } catch (error) {
      console.error("ensurePresenceExists error:", error);
      throw error;
    }
  }

  private mapToPresence(data: any): Presence {
    return {
      id: data.id || "",
      userId: data.user_id,
      isOnline: data.is_online,
      lastSeen: data.last_seen,
      currentProfileViewing: data.current_profile_viewing,
      typingInChatWith: data.typing_in_chat_with,
      ghostMode: data.ghost_mode,
      updatedAt: data.updated_at,
    };
  }
}
