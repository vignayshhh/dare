import { db } from "@/backend/lib/firebase";
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
} from "firebase/firestore";
import { redisCache } from "@/services/redisCache.server";
import { logFirestoreError } from "@/utils/firestoreErrors";

export interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  is_18_plus: boolean;
  consent_accepted: boolean;
  dares_completed: number;
  dares_refused: number;
  ghost_mode_active: boolean;
  ghost_mode_expires_at: string | null;
  created_at: string;
  updated_at: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  email?: string | null;
  hasCompletedProfileCreation?: boolean;
}

export interface CreateProfileRequest {
  user_id: string;
  username: string;
  display_name: string;
  is_18_plus: boolean;
  consent_accepted: boolean;
  bio?: string;
  avatar_url?: string;
  visibility?: "PUBLIC" | "PRIVATE";
}

class UserService {
  private profileCache = new Map<
    string,
    { data: UserProfile; expiresAt: number }
  >();
  private readonly profileCacheTtlMs = 15 * 60 * 1000;
  private allUsersCache: { data: UserProfile[]; expiresAt: number } | null =
    null;

  private getProfileTimestamp(value: unknown): number {
    if (!value) return 0;

    if (typeof value === "string" || typeof value === "number") {
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    if (typeof value === "object") {
      const timestamp = value as {
        toDate?: () => Date;
        seconds?: number;
        nanoseconds?: number;
      };

      if (typeof timestamp.toDate === "function") {
        const time = timestamp.toDate().getTime();
        return Number.isFinite(time) ? time : 0;
      }

      if (typeof timestamp.seconds === "number") {
        return (
          timestamp.seconds * 1000 +
          Math.floor((timestamp.nanoseconds || 0) / 1000000)
        );
      }
    }

    return 0;
  }

  private getCreatedTime(profile: Partial<UserProfile>): number {
    return this.getProfileTimestamp(profile.created_at ?? profile.createdAt);
  }

  private isKnownMockProfile(profile: Partial<UserProfile>): boolean {
    const profileId = String(profile.user_id || profile.id || "").toLowerCase();
    const username = String(profile.username || "").toLowerCase();
    const email = String(profile.email || "").toLowerCase();

    return (
      profileId === "guest-demo-user" ||
      username === "project_guest" ||
      email.endsWith("@demo.local")
    );
  }

  private isDiscoverableProfile(profile: Partial<UserProfile>): boolean {
    const username = String(profile.username || "").trim();

    if (!username) return false;
    if (profile.visibility === "PRIVATE") return false;
    if (profile.hasCompletedProfileCreation === false) return false;
    if (this.isKnownMockProfile(profile)) return false;

    return true;
  }

  private dedupeProfiles(profiles: UserProfile[]): UserProfile[] {
    const seen = new Set<string>();

    return profiles.filter((profile) => {
      const key = profile.user_id || profile.id;
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const now = Date.now();
      const cached = this.profileCache.get(userId);

      if (cached && cached.expiresAt > now) {
        return cached.data;
      }

      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) return null;

      const userData = userDoc.data();

      // Debug logging to see what fields are stored
      console.log("🔍 getProfile - Document ID:", userId);
      console.log("🔍 getProfile - Document data:", userData);

      const profile = { id: userDoc.id, ...userData } as UserProfile;

      // Cache result
      this.profileCache.set(userId, {
        data: profile,
        expiresAt: now + this.profileCacheTtlMs,
      });

      return profile;
    } catch (error) {
      logFirestoreError("Error fetching profile:", error);
      return null;
    }
  }

  async createProfile(
    request: CreateProfileRequest,
  ): Promise<UserProfile | null> {
    try {
      const userRef = doc(db, "users", request.user_id);
      const profileData = {
        user_id: request.user_id,
        username: request.username,
        display_name: request.display_name,
        bio: request.bio || null,
        avatar_url: request.avatar_url || null,
        visibility: request.visibility || "PUBLIC",
        is_18_plus: request.is_18_plus,
        consent_accepted: request.consent_accepted,
        dares_completed: 0,
        dares_refused: 0,
        ghost_mode_active: false,
        ghost_mode_expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await setDoc(userRef, profileData);
      return { id: request.user_id, ...profileData } as UserProfile;
    } catch (error) {
      console.error("Error creating profile:", error);
      return null;
    }
  }

  async updateProfile(
    userId: string,
    updates: Partial<UserProfile>,
  ): Promise<UserProfile | null> {
    try {
      const userRef = doc(db, "users", userId);
      const updatedAt = new Date().toISOString();
      await updateDoc(userRef, {
        ...updates,
        updated_at: updatedAt,
      });

      // Build result from cached profile + updates (skip re-read)
      const cached = this.profileCache.get(userId);
      const base = cached?.data ?? ({ id: userId } as UserProfile);
      const result = {
        ...base,
        ...updates,
        id: userId,
        updated_at: updatedAt,
      } as UserProfile;

      // Update caches
      this.profileCache.set(userId, {
        data: result,
        expiresAt: Date.now() + this.profileCacheTtlMs,
      });
      this.allUsersCache = null; // Invalidate search cache

      // Invalidate Redis author cache and feed cache
      redisCache.delete(`author:${userId}`).catch(() => {});
      redisCache.invalidatePattern("feed:*").catch(() => {});

      // Background: propagate denormalized author to user's posts
      if (updates.username || updates.display_name || updates.avatar_url) {
        this.propagateDenormalizedAuthor(userId, result).catch(() => {});
      }

      return result;
    } catch (error) {
      console.error("Error updating profile:", error);
      return null;
    }
  }

  private async propagateDenormalizedAuthor(
    userId: string,
    profile: UserProfile,
  ): Promise<void> {
    try {
      const postsRef = collection(db, "posts");
      const q = query(postsRef, where("author_id", "==", userId));
      const snap = await getDocs(q);
      const batch: Promise<void>[] = [];
      snap.forEach((docSnap) => {
        batch.push(
          updateDoc(doc(db, "posts", docSnap.id), {
            author_username: profile.username || "",
            author_display_name: profile.display_name || "",
            author_avatar_url: profile.avatar_url || "",
          }),
        );
      });
      await Promise.all(batch);
    } catch {
      // non-fatal background task
    }
  }

  async searchProfiles(searchQuery: string): Promise<UserProfile[]> {
    try {
      if (!searchQuery.trim() || searchQuery.length < 1) {
        return [];
      }

      const now = Date.now();
      let allUsers: UserProfile[];

      if (this.allUsersCache && this.allUsersCache.expiresAt > now) {
        allUsers = this.allUsersCache.data;
      } else {
        const usersRef = collection(db, "users");
        const querySnapshot = await getDocs(usersRef);
        allUsers = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserProfile[];
        this.allUsersCache = {
          data: allUsers,
          expiresAt: now + this.profileCacheTtlMs,
        };
      }

      const searchTerm = searchQuery.toLowerCase().trim();

      console.log(
        `🔍 Real-time search for "${searchQuery}" - Total users in DB: ${allUsers.length}`,
      );

      const filteredUsers = allUsers.filter((user: UserProfile) => {
        const usernameMatch = user.username?.toLowerCase().includes(searchTerm);
        const displayNameMatch = user.display_name
          ?.toLowerCase()
          .includes(searchTerm);
        return (usernameMatch || displayNameMatch) && this.isDiscoverableProfile(user);
      });

      const sortedUsers = filteredUsers.sort((a, b) => {
        const aUsername = a.username?.toLowerCase() || "";
        const bUsername = b.username?.toLowerCase() || "";
        const aDisplayName = a.display_name?.toLowerCase() || "";
        const bDisplayName = b.display_name?.toLowerCase() || "";

        // Exact username match gets highest priority
        if (aUsername === searchTerm) return -1;
        if (bUsername === searchTerm) return 1;

        // Username starts with search term gets high priority
        const aStartsWith = aUsername.startsWith(searchTerm);
        const bStartsWith = bUsername.startsWith(searchTerm);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        // Display name starts with search term
        const aDisplayNameStarts = aDisplayName.startsWith(searchTerm);
        const bDisplayNameStarts = bDisplayName.startsWith(searchTerm);
        if (aDisplayNameStarts && !bDisplayNameStarts) return -1;
        if (!aDisplayNameStarts && bDisplayNameStarts) return 1;

        const createdTimeDiff = this.getCreatedTime(b) - this.getCreatedTime(a);
        if (createdTimeDiff !== 0) return createdTimeDiff;

        return aUsername.localeCompare(bUsername);
      });

      console.log(
        `🔍 Real-time search for "${searchQuery}" - Filtered users: ${sortedUsers.length}`,
      );

      const uniqueUsers = this.dedupeProfiles(sortedUsers);

      console.log(
        `🔍 Real-time search for "${searchQuery}" - Unique users: ${uniqueUsers.length}`,
      );
      console.log(
        `🔍 Search results:`,
        uniqueUsers.map((u) => ({
          id: u.id,
          user_id: u.user_id,
          username: u.username,
          display_name: u.display_name,
        })),
      );

      return uniqueUsers;
    } catch (error) {
      logFirestoreError("Error searching profiles:", error);
      return [];
    }
  }

  async getPublicProfiles(): Promise<UserProfile[]> {
    try {
      const usersRef = collection(db, "users");
      const querySnapshot = await getDocs(usersRef);

      const allUsers = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as UserProfile[];

      const publicUsers = this.dedupeProfiles(
        allUsers
          .filter((user) => this.isDiscoverableProfile(user))
          .sort((a, b) => {
            const createdTimeDiff = this.getCreatedTime(b) - this.getCreatedTime(a);
            if (createdTimeDiff !== 0) return createdTimeDiff;

            return (a.username || "").localeCompare(b.username || "");
          }),
      );

      console.log(
        `📊 getPublicProfiles - Total users: ${allUsers.length}, Public/Undefined: ${publicUsers.length}`,
      );

      return publicUsers;
    } catch (error) {
      logFirestoreError("Error fetching public profiles:", error);
      return [];
    }
  }

  async deleteProfile(userId: string): Promise<boolean> {
    try {
      const userRef = doc(db, "users", userId);
      await deleteDoc(userRef);
      return true;
    } catch (error) {
      console.error("Error deleting profile:", error);
      return false;
    }
  }

  async updateDaresStats(userId: string, completed: boolean): Promise<boolean> {
    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) return false;

      const currentData = userDoc.data() as UserProfile;
      const updates = {
        dares_completed: completed
          ? currentData.dares_completed + 1
          : currentData.dares_completed,
        dares_refused: !completed
          ? currentData.dares_refused + 1
          : currentData.dares_refused,
        updated_at: new Date().toISOString(),
      };

      await updateDoc(userRef, updates);
      return true;
    } catch (error) {
      logFirestoreError("Error updating dares stats:", error);
      return false;
    }
  }

  async setGhostMode(
    userId: string,
    active: boolean,
    durationMinutes?: number,
  ): Promise<boolean> {
    try {
      const userRef = doc(db, "users", userId);
      const updates: any = {
        ghost_mode_active: active,
        updated_at: new Date().toISOString(),
      };

      if (active && durationMinutes) {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes);
        updates.ghost_mode_expires_at = expiresAt.toISOString();
      } else if (!active) {
        updates.ghost_mode_expires_at = null;
      }

      await updateDoc(userRef, updates);
      return true;
    } catch (error) {
      console.error("Error setting ghost mode:", error);
      return false;
    }
  }
}

export const userService = new UserService();
