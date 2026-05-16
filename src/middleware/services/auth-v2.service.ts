import { auth, db } from "@/backend/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  updateProfile as firebaseUpdateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { avatarService } from "./avatar.service";
import {
  SECURITY_LIMITS,
  SecurityError,
  secureLogError,
  validateDisplayName,
  validateEmail,
  validateOptionalMediaUrl,
  validateOptionalBio,
  validateUsername,
} from "@/security/appSecurity";
import { isFirestoreOfflineError } from "@/utils/firestoreErrors";
import { checkRateLimit } from "@/security/rateLimiter";
import { twoFactorAuthService } from "@/security/twoFactorAuth";

const isDevelopment = process.env.NODE_ENV !== "production";

function debugLog(...args: unknown[]) {
  if (isDevelopment) {
    console.log(...args);
  }
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  isOnline: boolean;
  hasCompletedProfileCreation?: boolean; // Track if user has completed profile creation
  is_18_plus?: boolean; // Track if user has verified they are 18+
  consent_accepted?: boolean; // Track if user has accepted terms of service
  notificationPreferences?: NotificationPreferences;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface CreateUserData {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  bio?: string;
}

export interface UpdateUserData {
  displayName?: string;
  username?: string;
  bio?: string;
  avatar?: string;
  visibility?: "PUBLIC" | "PRIVATE";
  hasCompletedProfileCreation?: boolean;
  is_18_plus?: boolean;
  consent_accepted?: boolean;
  notificationPreferences?: NotificationPreferences;
}

export interface NotificationPreferences {
  challenges: boolean;
  messages: boolean;
  friendRequests: boolean;
}

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "dare",
  "moderator",
  "mod",
  "root",
  "security",
  "support",
  "system",
]);

export interface ActivityUpdate {
  postsCount?: number;
  lastActiveAt?: string;
}

class AuthService {
  private static instance: AuthService;
  private static readonly USER_CACHE_KEY = "dare_auth_user_cache";
  private subscribers: Set<(user: AuthUser | null) => void> = new Set();
  private currentUser: AuthUser | null = null;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    if (AuthService.instance) {
      return AuthService.instance;
    }
    AuthService.instance = this;
    // Restore cached user synchronously so callers see the user immediately
    this.currentUser = this.restoreFromCache();
  }

  private saveToCache(user: AuthUser | null): void {
    if (typeof window === "undefined") return;
    try {
      if (user) {
        localStorage.setItem(AuthService.USER_CACHE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(AuthService.USER_CACHE_KEY);
      }
    } catch {
      // localStorage unavailable (private browsing, storage full, etc.)
    }
  }

  private restoreFromCache(): AuthUser | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(AuthService.USER_CACHE_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Subscribe to auth state changes
  subscribe(callback: (user: AuthUser | null) => void) {
    this.subscribers.add(callback);
    callback(this.currentUser);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach((callback) => callback(this.currentUser));
  }

  private async assertUsernameAvailable(
    username: string,
    excludeUserId?: string,
  ) {
    // Check the usernames collection (designed for uniqueness enforcement)
    // This collection can be read by any signed-in user
    const usernameRef = doc(db, "usernames", username);
    const usernameSnap = await getDoc(usernameRef);

    if (usernameSnap.exists()) {
      const data = usernameSnap.data();
      // Allow the same user to keep their username during updates
      if (excludeUserId && data.user_id === excludeUserId) {
        return;
      }
      throw new SecurityError("That username is already taken.");
    }
  }

  // Update current user, persist to cache, and notify subscribers
  private setCurrentUser(user: AuthUser | null) {
    this.currentUser = user;
    this.saveToCache(user);
    this.notifySubscribers();
  }

  // Map Firestore user doc + Firebase Auth UID -> AuthUser
  private mapDocToAuthUser(uid: string, email: string, data: any): AuthUser {
    return {
      id: uid,
      email: data.email || email,
      username: data.username || "",
      displayName: data.displayName || data.display_name || data.username || "",
      bio: data.bio || "",
      avatar: data.avatar || data.avatar_url,
      followersCount: data.followersCount || 0,
      followingCount: data.followingCount || 0,
      postsCount: data.postsCount || 0,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      lastActiveAt: data.lastActiveAt || new Date().toISOString(),
      isOnline: data.isOnline ?? true,
      hasCompletedProfileCreation: data.hasCompletedProfileCreation ?? true,
      is_18_plus: data.is_18_plus,
      consent_accepted: data.consent_accepted,
      notificationPreferences: data.notificationPreferences,
    };
  }

  // Load user profile from Firestore using Firebase Auth UID
  private async loadProfile(
    firebaseUser: FirebaseUser,
  ): Promise<AuthUser | null> {
    try {
      const userRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        // No profile doc yet — will be created during signup or profile completion
        return null;
      }
      return this.mapDocToAuthUser(
        firebaseUser.uid,
        firebaseUser.email || "",
        snap.data(),
      );
    } catch (error) {
      secureLogError("loadProfile failed", error);
      if (isFirestoreOfflineError(error)) {
        const cachedUser = this.restoreFromCache();
        if (cachedUser?.id === firebaseUser.uid) {
          return cachedUser;
        }
      }
      throw error;
    }
  }

  // Initialize auth: wire up Firebase Auth state listener.
  // This is the single source of truth for who is signed in.
  // Returns once the first auth state resolution has happened so callers can
  // render with a settled auth state.
  private authListenerRegistered = false;
  async initializeAuth(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      if (this.authListenerRegistered) return;
      this.authListenerRegistered = true;

      if (!auth) {
        console.warn("⚠️ Firebase Auth not configured. Running in mock mode.");
        this.setCurrentUser(null);
        return;
      }

      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        secureLogError("setPersistence failed", error);
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        const resolveOnce = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        // Aggressive timeout for mobile - 1.5s to prevent stuck loading
        const timeoutId = globalThis.setTimeout(() => {
          console.warn(
            "Auth initialization timed out; forcing resolve to prevent stuck loading.",
          );
          resolveOnce();
        }, 1500);

        try {
          onAuthStateChanged(auth, async (firebaseUser) => {
            try {
              if (!firebaseUser) {
                this.setCurrentUser(null);
              } else {
                const profile = await this.loadProfile(firebaseUser);
                this.setCurrentUser(profile);
                debugLog(
                  "✅ Auth restored for:",
                  profile?.username || firebaseUser.email,
                );
              }
            } catch (profileError) {
              console.error(
                "Error loading profile during auth init:",
                profileError,
              );
              this.setCurrentUser(null);
            } finally {
              globalThis.clearTimeout(timeoutId);
              resolveOnce();
            }
          });
        } catch (error) {
          console.error("Error setting up auth listener:", error);
          globalThis.clearTimeout(timeoutId);
          resolveOnce();
        }
      });
    })();

    return this.initializationPromise;
  }

  // Sign up new user using Firebase Auth email/password
  async signUp(userData: CreateUserData): Promise<AuthResponse> {
    let firebaseUser: any = null;
    try {
      const normalizedEmail = validateEmail(userData.email);

      // Skip Firestore-based rate limiting for sign-up since user is not authenticated yet
      // Firebase Auth has built-in rate limiting for sign-up attempts
      const normalizedUsername = validateUsername(userData.username);
      const normalizedDisplayName = validateDisplayName(
        userData.displayName || normalizedUsername,
      );
      const normalizedBio = validateOptionalBio(userData.bio);
      const normalizedPassword = userData.password ?? "";

      if (
        normalizedPassword.length < SECURITY_LIMITS.passwordMin ||
        normalizedPassword.length > SECURITY_LIMITS.passwordMax
      ) {
        throw new SecurityError(
          `Password must be between ${SECURITY_LIMITS.passwordMin} and ${SECURITY_LIMITS.passwordMax} characters.`,
        );
      }

      if (RESERVED_USERNAMES.has(normalizedUsername)) {
        throw new SecurityError("That username is not available.");
      }

      // Create Firebase Auth user first (this authenticates them for Firestore operations)
      const cred = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        normalizedPassword,
      );
      firebaseUser = cred.user;
      const uid = firebaseUser.uid;

      // Set displayName on Firebase Auth profile (optional but nice)
      try {
        await firebaseUpdateProfile(firebaseUser, {
          displayName: normalizedDisplayName,
        });
      } catch {
        // Non-fatal
      }

      // Create user profile document in Firestore. Doc ID == Firebase UID so
      // request.auth.uid matches the doc ID for ownership rule checks.
      const userRef = doc(db, "users", uid);
      await setDoc(userRef, {
        // NEVER write the password. Firebase Auth owns credentials now.
        // Firestore rules expect snake_case field names
        email: normalizedEmail,
        username: normalizedUsername,
        display_name: normalizedDisplayName,
        bio: normalizedBio,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        isOnline: true,
        hasCompletedProfileCreation: false,
        is_18_plus: false,
        consent_accepted: false,
        user_id: uid,
        visibility: "PUBLIC",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        notificationPreferences: {
          challenges: true,
          messages: true,
          friendRequests: true,
        },
      });

      // Create username mapping for uniqueness enforcement
      try {
        const usernameRef = doc(db, "usernames", normalizedUsername);
        await setDoc(usernameRef, {
          user_id: uid,
        });
      } catch (usernameError) {
        console.error("Failed to create username mapping:", usernameError);
        // Non-fatal - username uniqueness is enforced by Firestore rules during user creation
      }

      // Create profile object for local state (uses camelCase)
      const profile: AuthUser = {
        id: uid,
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: normalizedDisplayName,
        bio: normalizedBio,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        isOnline: true,
        hasCompletedProfileCreation: false,
        is_18_plus: false,
        consent_accepted: false,
        notificationPreferences: {
          challenges: true,
          messages: true,
          friendRequests: true,
        },
      };

      this.setCurrentUser(profile);
      return { success: true, user: profile };
    } catch (error: any) {
      secureLogError("Sign up failed", error);

      // Clean up Firebase Auth user if we created it but failed later
      if (firebaseUser) {
        try {
          await firebaseUser.delete();
        } catch (deleteError) {
          console.error("Failed to clean up Firebase Auth user:", deleteError);
        }
      }

      // Surface friendlier Firebase Auth error codes
      const code: string = error?.code || "";
      let msg = "Unable to create your account.";
      if (code === "auth/email-already-in-use")
        msg = "An account with this email already exists.";
      else if (code === "auth/weak-password") msg = "Password is too weak.";
      else if (code === "auth/invalid-email") msg = "Email address is invalid.";
      else if (error instanceof SecurityError) msg = error.message;
      else if (error.message.includes("Rate limit exceeded"))
        msg = error.message;
      return { success: false, error: msg };
    }
  }

  // Sign in user using Firebase Auth email/password
  async signIn(email: string, password: string): Promise<AuthResponse> {
    // Check if Firebase Auth is available
    if (!auth || !db) {
      return {
        success: false,
        error:
          "Firebase not configured. Please set up Firebase credentials in .env.local",
      };
    }

    try {
      const normalizedEmail = validateEmail(email);
      // Skip Firestore-based rate limiting for sign-in - Firebase Auth has built-in rate limiting

      const cred = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password,
      );
      const firebaseUser = cred.user;
      const uid = firebaseUser.uid;

      // Load the user's profile doc
      const profile = await this.loadProfile(firebaseUser);
      if (!profile) {
        await firebaseSignOut(auth);
        this.setCurrentUser(null);
        return {
          success: false,
          error:
            "Your login exists, but its profile record could not be found. Please contact support instead of creating a new account.",
        };
      }

      // Touch lastActiveAt on successful sign-in
      try {
        await updateDoc(doc(db, "users", uid), {
          lastActiveAt: serverTimestamp(),
        });
      } catch {
        // non-fatal
      }

      this.setCurrentUser(profile);
      return { success: true, user: profile };
    } catch (error: any) {
      secureLogError("Sign in failed", error);
      const code: string = error?.code || "";
      let msg = "Unable to sign in.";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      )
        msg = "Invalid email or password.";
      else if (code === "auth/too-many-requests")
        msg = "Too many attempts. Please try again later.";
      else if (code === "auth/invalid-email") msg = "Email address is invalid.";
      else if (code === "permission-denied")
        msg =
          "Signed in, but your profile could not be loaded. Please try again after refreshing.";
      return { success: false, error: msg };
    }
  }

  // Sign out user via Firebase Auth
  async signOut(): Promise<void> {
    console.log("🚪 [auth-v2] signOut called");
    // Check if Firebase Auth is available
    if (!auth) {
      this.setCurrentUser(null);
      this.clearPersistedAuth();
      debugLog("User signed out (mock mode)");
      return;
    }

    try {
      await firebaseSignOut(auth);
      console.log("✅ [auth-v2] Firebase signOut successful");
      this.setCurrentUser(null);
      this.clearPersistedAuth();
      debugLog("User signed out");
    } catch (error) {
      console.error("❌ [auth-v2] Firebase signOut error:", error);
      secureLogError("Sign out failed", error);
      // Force clear local state even if Firebase sign-out fails
      this.setCurrentUser(null);
      this.clearPersistedAuth();
    }
  }

  // Clear all Firebase persistence to prevent re-authentication on mobile
  private clearPersistedAuth(): void {
    try {
      if (typeof window === "undefined") return;

      // Clear Firebase auth-related localStorage entries
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("firebase:") ||
            key.includes("firebaseLocalStorageDb"))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      console.log(
        `✅ [auth-v2] Cleared ${keysToRemove.length} firebase keys from localStorage`,
      );

      // Clear IndexedDB where Firebase stores auth persistence
      if (typeof indexedDB !== "undefined" && indexedDB.databases) {
        indexedDB
          .databases()
          .then((databases) => {
            for (const db of databases) {
              if (db.name && db.name.includes("firebase")) {
                indexedDB.deleteDatabase(db.name);
                console.log(`✅ [auth-v2] Deleted IndexedDB: ${db.name}`);
              }
            }
          })
          .catch((err) => {
            console.error("⚠️ [auth-v2] Failed to clear IndexedDB:", err);
          });
      }
    } catch (error) {
      console.error("⚠️ [auth-v2] Failed to clear persisted auth:", error);
    }
  }

  // Mark profile creation as completed
  async completeProfileCreation(): Promise<void> {
    try {
      if (!this.currentUser) {
        throw new Error("No user logged in");
      }

      const updatedUser = {
        ...this.currentUser,
        hasCompletedProfileCreation: true,
        updatedAt: new Date().toISOString(),
      };

      // Update in Firestore
      const userRef = doc(db, "users", this.currentUser.id);
      await updateDoc(userRef, {
        hasCompletedProfileCreation: true,
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      // Update local state
      this.currentUser = updatedUser;
      this.notifySubscribers();

      debugLog("Profile creation marked as completed");
    } catch (error) {
      secureLogError("completeProfileCreation failed", error);
      throw error;
    }
  }

  // Update profile
  async updateProfile(updates: UpdateUserData): Promise<AuthResponse> {
    // Check if Firebase is available
    if (!auth || !db) {
      return {
        success: false,
        error:
          "Firebase not configured. Please set up Firebase credentials in .env.local",
      };
    }

    try {
      if (!this.currentUser) {
        throw new Error("Not authenticated");
      }

      await checkRateLimit(
        `profile_update_${this.currentUser.id}`,
        SECURITY_LIMITS.profileUpdatesPerWindow,
        SECURITY_LIMITS.rateLimitWindowMs,
      );

      const filteredUpdates: UpdateUserData = {};

      if (updates.displayName !== undefined) {
        filteredUpdates.displayName = validateDisplayName(updates.displayName);
      }

      if (updates.username !== undefined) {
        const normalizedUsername = validateUsername(updates.username);
        if (RESERVED_USERNAMES.has(normalizedUsername)) {
          throw new SecurityError("That username is not available.");
        }
        filteredUpdates.username = normalizedUsername;
      }

      if (updates.bio !== undefined) {
        filteredUpdates.bio = validateOptionalBio(updates.bio);
      }

      if (updates.avatar !== undefined) {
        filteredUpdates.avatar = validateOptionalMediaUrl(updates.avatar);
      }

      if (updates.visibility !== undefined) {
        filteredUpdates.visibility =
          updates.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC";
      }

      if (updates.hasCompletedProfileCreation !== undefined) {
        filteredUpdates.hasCompletedProfileCreation = Boolean(
          updates.hasCompletedProfileCreation,
        );
      }

      if (updates.is_18_plus !== undefined) {
        filteredUpdates.is_18_plus = Boolean(updates.is_18_plus);
      }

      if (updates.consent_accepted !== undefined) {
        filteredUpdates.consent_accepted = Boolean(updates.consent_accepted);
      }

      if (updates.notificationPreferences !== undefined) {
        filteredUpdates.notificationPreferences = {
          challenges: Boolean(updates.notificationPreferences.challenges),
          messages: Boolean(updates.notificationPreferences.messages),
          friendRequests: Boolean(
            updates.notificationPreferences.friendRequests,
          ),
        };
      }

      if (
        filteredUpdates.username &&
        filteredUpdates.username !== this.currentUser.username
      ) {
        await this.assertUsernameAvailable(
          filteredUpdates.username,
          this.currentUser.id,
        );
      }

      // If avatar is being updated, store it in both fields for consistency
      const firestoreUpdates: Record<string, unknown> = { ...filteredUpdates };
      if (filteredUpdates.displayName) {
        firestoreUpdates.display_name = filteredUpdates.displayName;
      }
      if (filteredUpdates.avatar) {
        firestoreUpdates.avatar_url = filteredUpdates.avatar;
      }

      const userRef = doc(db, "users", this.currentUser.id);
      await updateDoc(userRef, {
        ...firestoreUpdates,
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      // Update local state
      this.currentUser = {
        ...this.currentUser,
        ...filteredUpdates,
        updatedAt: new Date().toISOString(),
      };
      this.notifySubscribers();

      return { success: true, user: this.currentUser };
    } catch (error) {
      secureLogError("Profile update failed", error);
      return {
        success: false,
        error:
          error instanceof SecurityError
            ? error.message
            : "Unable to update your profile.",
      };
    }
  }

  // Get current user
  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  // Check if authenticated
  isAuthenticated(): boolean {
    return !!this.currentUser;
  }

  // Get user stats
  async getUserStats(userId: string): Promise<{
    followersCount: number;
    followingCount: number;
    postsCount: number;
  }> {
    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as AuthUser;

      return {
        followersCount: userData.followersCount || 0,
        followingCount: userData.followingCount || 0,
        postsCount: userData.postsCount || 0,
      };
    } catch (error) {
      secureLogError("getUserStats failed", error);
      return {
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
      };
    }
  }

  // Update user activity (posts, likes, etc.)
  async updateUserActivity(activity: ActivityUpdate): Promise<void> {
    try {
      if (!this.currentUser) return;

      const userRef = doc(db, "users", this.currentUser.id);
      const updateData: any = {
        updatedAt: serverTimestamp(),
      };

      if (activity.postsCount !== undefined) {
        updateData.postsCount = activity.postsCount;
      }

      if (activity.lastActiveAt) {
        updateData.lastActiveAt = serverTimestamp();
      }

      await updateDoc(userRef, updateData);

      // Update local state
      if (activity.postsCount !== undefined) {
        this.currentUser.postsCount = activity.postsCount;
      }
      if (activity.lastActiveAt) {
        this.currentUser.lastActiveAt = activity.lastActiveAt;
      }

      debugLog("User activity updated");
    } catch (error) {
      secureLogError("updateUserActivity failed", error);
    }
  }

  // Update avatar with image upload
  async uploadAvatar(file: File): Promise<AuthResponse> {
    try {
      if (!this.currentUser) {
        throw new Error("Not authenticated");
      }

      await checkRateLimit(
        `profile_avatar_${this.currentUser.id}`,
        SECURITY_LIMITS.uploadAttemptsPerWindow,
        SECURITY_LIMITS.rateLimitWindowMs,
      );

      // Upload new avatar
      const uploadResponse = await avatarService.updateAvatar(
        this.currentUser.id,
        file,
        this.currentUser.avatar,
      );

      if (!uploadResponse.success || !uploadResponse.url) {
        return {
          success: false,
          error: uploadResponse.error || "Failed to upload avatar",
        };
      }

      // Update user profile with new avatar URL
      const updateResponse = await this.updateProfile({
        avatar: uploadResponse.url,
      });
      return updateResponse;
    } catch (error) {
      secureLogError("Avatar upload failed", error);
      return {
        success: false,
        error:
          error instanceof SecurityError
            ? error.message
            : "Unable to upload avatar.",
      };
    }
  }

  // SECURITY FIX: Account lockout mechanism
  private async checkAccountLockout(email: string): Promise<void> {
    try {
      const lockoutRef = doc(db, "account_lockouts", email);
      const snap = await getDoc(lockoutRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data.locked_until && data.locked_until instanceof Timestamp) {
          const lockedUntil = data.locked_until.toDate();
          if (lockedUntil > new Date()) {
            throw new Error(
              `Account locked until ${lockedUntil.toLocaleString()}. Please try again later.`,
            );
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Account locked")) {
        throw error;
      }
      // Fail open if lockout check fails
      console.error("Account lockout check failed:", error);
    }
  }

  private async recordFailedAttempt(email: string): Promise<void> {
    try {
      const lockoutRef = doc(db, "account_lockouts", email);
      const snap = await getDoc(lockoutRef);

      const now = new Date();
      let failedAttempts = 1;
      let lockedUntil = null;

      if (snap.exists()) {
        const data = snap.data();
        failedAttempts = (data.failed_attempts || 0) + 1;

        // Progressive lockout
        if (failedAttempts >= 5 && failedAttempts < 10) {
          lockedUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes
        } else if (failedAttempts >= 10 && failedAttempts < 20) {
          lockedUntil = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
        } else if (failedAttempts >= 20) {
          lockedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        }
      }

      await setDoc(
        lockoutRef,
        {
          email,
          failed_attempts: failedAttempts,
          last_failed_at: Timestamp.fromDate(now),
          locked_until: lockedUntil ? Timestamp.fromDate(lockedUntil) : null,
        },
        { merge: true },
      );
    } catch (error) {
      console.error("Failed to record failed attempt:", error);
    }
  }

  private async clearFailedAttempts(email: string): Promise<void> {
    try {
      const lockoutRef = doc(db, "account_lockouts", email);
      await updateDoc(lockoutRef, {
        failed_attempts: 0,
        last_failed_at: null,
        locked_until: null,
      });
    } catch (error) {
      console.error("Failed to clear failed attempts:", error);
    }
  }

  // Two-Factor Authentication integration
  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    try {
      return await twoFactorAuthService.isEnabled(userId);
    } catch (error) {
      secureLogError("Error checking 2FA status", error);
      return false;
    }
  }

  async enableTwoFactor(
    method: "email" | "sms",
    phoneNumber?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.currentUser) {
        return { success: false, error: "Not authenticated" };
      }

      const result = await twoFactorAuthService.enableTwoFactor(
        this.currentUser.id,
        method,
        phoneNumber,
      );

      return result;
    } catch (error) {
      secureLogError("Error enabling 2FA", error);
      return { success: false, error: "Failed to enable 2FA" };
    }
  }

  async verifyTwoFactorSetup(
    code: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.currentUser) {
        return { success: false, error: "Not authenticated" };
      }

      const result = await twoFactorAuthService.verifySetup(
        this.currentUser.id,
        code,
      );

      return result;
    } catch (error) {
      secureLogError("Error verifying 2FA setup", error);
      return { success: false, error: "Verification failed" };
    }
  }

  async verifyTwoFactorCode(
    code: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.currentUser) {
        return { success: false, error: "Not authenticated" };
      }

      const result = await twoFactorAuthService.verifyCode(
        this.currentUser.id,
        code,
      );

      return result;
    } catch (error) {
      secureLogError("Error verifying 2FA code", error);
      return { success: false, error: "Verification failed" };
    }
  }

  async disableTwoFactor(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.currentUser) {
        return { success: false, error: "Not authenticated" };
      }

      const result = await twoFactorAuthService.disableTwoFactor(
        this.currentUser.id,
      );

      return result;
    } catch (error) {
      secureLogError("Error disabling 2FA", error);
      return { success: false, error: "Failed to disable 2FA" };
    }
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
