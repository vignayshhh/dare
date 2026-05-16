import {
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  collection,
  addDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  IUserRepository,
  UserProfile,
  UserProfileUpdate,
} from "@/backend/domain/interfaces/IUserRepository";

export class UserRepository implements IUserRepository {
  async getProfileById(profileId: string): Promise<UserProfile | null> {
    try {
      const profileDocRef = doc(db, "users", profileId);
      const profileDoc = await getDoc(profileDocRef);

      if (!profileDoc.exists()) {
        return null;
      }

      const data = profileDoc.data();
      const profile = this.mapToUserProfile(data, profileDoc.id);

      // Ensure the profile ID and userId match the document ID
      return { ...profile, id: profileDoc.id, userId: profileDoc.id };
    } catch (error) {
      throw error;
    }
  }

  async getProfileByUserId(userId: string): Promise<UserProfile | null> {
    try {
      const result = await this.getProfileById(userId);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async updateProfile(
    profileId: string,
    updates: UserProfileUpdate,
  ): Promise<UserProfile> {
    try {
      const profileRef = doc(db, "users", profileId);

      const firestoreUpdates: any = {
        updated_at: serverTimestamp(),
      };

      if (updates.displayName !== undefined) {
        firestoreUpdates.display_name = updates.displayName;
      }
      if (updates.bio !== undefined) {
        firestoreUpdates.bio = updates.bio;
      }
      if (updates.avatarUrl !== undefined) {
        firestoreUpdates.avatar_url = updates.avatarUrl;
        firestoreUpdates.avatar = updates.avatarUrl; // Also store in avatar field for consistency
      }
      if (updates.visibility !== undefined) {
        firestoreUpdates.visibility = updates.visibility;
      }
      if (updates.ghostModeActive !== undefined) {
        firestoreUpdates.ghost_mode_active = updates.ghostModeActive;
      }
      if (updates.daresCompleted !== undefined) {
        firestoreUpdates.dares_completed = updates.daresCompleted;
      }
      if (updates.daresRefused !== undefined) {
        firestoreUpdates.dares_refused = updates.daresRefused;
      }

      await updateDoc(profileRef, firestoreUpdates);

      const updatedProfile = await this.getProfileById(profileId);
      if (!updatedProfile) {
        throw new Error("Profile not found after update");
      }

      return updatedProfile;
    } catch (error) {
      console.error("updateProfile error:", error);
      throw error;
    }
  }

  async searchProfiles(
    searchQuery: string,
    limitCount: number = 20,
  ): Promise<UserProfile[]> {
    try {
      // SECURITY: Add input length validation to prevent DoS attacks
      if (searchQuery.length > 50) {
        throw new Error("Search query too long (max 50 characters)");
      }

      // First try the exact query for public users
      const profilesQuery = query(
        collection(db, "users"),
        where("username", ">=", searchQuery.toLowerCase()),
        where("username", "<=", searchQuery.toLowerCase() + "\uf8ff"),
        where("visibility", "==", "PUBLIC"),
        orderBy("username"),
        limit(limitCount),
      );

      const querySnapshot = await getDocs(profilesQuery);
      const profiles: UserProfile[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        profiles.push(this.mapToUserProfile(data, doc.id));
      });

      // If we don't have enough results, also search for users with undefined visibility
      if (profiles.length < limitCount) {
        const allUsersQuery = query(
          collection(db, "users"),
          where("username", ">=", searchQuery.toLowerCase()),
          where("username", "<=", searchQuery.toLowerCase() + "\uf8ff"),
          orderBy("username"),
          limit(limitCount * 2), // Get more to filter
        );

        const allUsersSnapshot = await getDocs(allUsersQuery);

        allUsersSnapshot.forEach((doc) => {
          const data = doc.data();
          // Only include users with undefined visibility (real users) that aren't already included
          if (data.visibility === undefined) {
            const userProfile = this.mapToUserProfile(data, doc.id);
            if (!profiles.some((p) => p.userId === userProfile.userId)) {
              profiles.push(userProfile);
            }
          }
        });
      }

      return profiles.slice(0, limitCount); // Limit final results
    } catch (error) {
      throw error;
    }
  }

  async canViewProfile(profileId: string, viewerId?: string): Promise<boolean> {
    try {
      const profile = await this.getProfileById(profileId);
      if (!profile) {
        return false;
      }

      if (profile.visibility === "PUBLIC") {
        return true;
      }

      if (profile.visibility === "PRIVATE" && viewerId === profile.userId) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async recordProfileView(profileId: string, viewerId: string): Promise<void> {
    try {
      const profileViewsRef = collection(db, "profile_views");
      const now = new Date().toISOString();

      const existingViewQuery = query(
        profileViewsRef,
        where("profile_id", "==", profileId),
        where("viewer_id", "==", viewerId),
      );

      const existingViewSnapshot = await getDocs(existingViewQuery);

      if (!existingViewSnapshot.empty) {
        const existingViewDoc = existingViewSnapshot.docs[0];
        const existingViewData = existingViewDoc.data();

        await updateDoc(existingViewDoc.ref, {
          view_count: existingViewData.view_count + 1,
          last_viewed_at: now,
        });
      } else {
        await addDoc(profileViewsRef, {
          profile_id: profileId,
          viewer_id: viewerId,
          view_count: 1,
          first_viewed_at: now,
          last_viewed_at: now,
        });
      }
    } catch (error) {
      throw error;
    }
  }

  private mapToUserProfile(data: any, docId: string): UserProfile {
    // Use docId as fallback for userId since Firestore doc ID IS the auth UID
    const userId = data.user_id || docId;
    const username = data.username || data.handle || `user_${userId.slice(-6)}`;
    const displayName =
      data.display_name || data.displayName || data.nickname || username;
    const avatarUrl = data.avatar_url || data.avatarUrl || data.avatar || null;

    return {
      id: userId,
      userId: userId,
      username,
      nickname: data.nickname || displayName,
      displayName,
      bio: data.bio,
      avatarUrl,
      visibility: data.visibility,
      is18Plus: data.is_18_plus,
      consentAccepted: data.consent_accepted,
      daresCompleted: data.dares_completed,
      daresRefused: data.dares_refused,
      ghostModeActive: data.ghost_mode_active,
      ghostModeExpiresAt: data.ghost_mode_expires_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}
