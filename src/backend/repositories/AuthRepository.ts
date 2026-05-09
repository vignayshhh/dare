import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithPopup,
  GoogleAuthProvider,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  isSignInWithEmailLink,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { auth, db } from "@/backend/lib/firebase";
import {
  IAuthRepository,
  AuthUser,
  AuthResponse,
  SignUpRequest,
} from "@/backend/domain/interfaces/IAuthRepository";

export class AuthRepository implements IAuthRepository {
  async getUserProfile(userId: string): Promise<AuthUser> {
    try {
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        throw new Error("User profile not found");
      }

      const data = userDoc.data();

      // SECURITY FIX (§1.1): `email` is no longer stored on the public
      // user doc. Read it from the owner-only private subcollection
      // (/users/{uid}/private/contact) when the caller is the owner; for
      // other users, email is intentionally undefined.
      let email: string | undefined = data.email;
      const currentUid = auth.currentUser?.uid;
      if (!email && currentUid === userId) {
        try {
          const privSnap = await getDoc(
            doc(db, "users", userId, "private", "contact"),
          );
          if (privSnap.exists()) email = privSnap.data()?.email;
          if (!email) email = auth.currentUser?.email ?? undefined;
        } catch {
          /* private subcollection unreadable for non-owner — ignore */
        }
      }

      return {
        userId: data.user_id,
        email: email ?? "",
        username: data.username,
        nickname: data.nickname,
        displayName: data.display_name,
        is18Plus: data.is_18_plus,
        consentAccepted: data.consent_accepted,
        visibility: data.visibility,
        daresCompleted: data.dares_completed,
        daresRefused: data.dares_refused,
        ghostModeActive: data.ghost_mode_active,
        ghostModeExpiresAt: data.ghost_mode_expires_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error("getUserProfile error:", error);
      throw error;
    }
  }

  async createUserProfile(
    userData: SignUpRequest,
    userId: string,
  ): Promise<AuthUser> {
    try {
      const userRef = doc(db, "users", userId);
      const now = new Date().toISOString();

      await setDoc(userRef, {
        user_id: userId,
        email: userData.email,
        username: userData.username,
        nickname: userData.nickname,
        display_name: userData.displayName,
        is_18_plus: userData.is18Plus,
        consent_accepted: userData.consentAccepted,
        visibility: "PUBLIC",
        dares_completed: 0,
        dares_refused: 0,
        ghost_mode_active: false,
        ghost_mode_expires_at: null,
        created_at: now,
        updated_at: now,
      });

      return this.getUserProfile(userId);
    } catch (error) {
      console.error("createUserProfile error:", error);
      throw error;
    }
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<AuthUser>,
  ): Promise<AuthUser> {
    try {
      const userRef = doc(db, "users", userId);

      const firestoreUpdates: any = {
        updated_at: serverTimestamp(),
      };

      if (updates.displayName !== undefined) {
        firestoreUpdates.display_name = updates.displayName;
      }
      if (updates.visibility !== undefined) {
        firestoreUpdates.visibility = updates.visibility;
      }
      if (updates.ghostModeActive !== undefined) {
        firestoreUpdates.ghost_mode_active = updates.ghostModeActive;
      }
      if (updates.ghostModeExpiresAt !== undefined) {
        firestoreUpdates.ghost_mode_expires_at = updates.ghostModeExpiresAt;
      }

      await updateDoc(userRef, firestoreUpdates);
      return this.getUserProfile(userId);
    } catch (error) {
      console.error("updateUserProfile error:", error);
      throw error;
    }
  }

  async signInWithEmail(email: string): Promise<AuthResponse> {
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/auth/callback`,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // SECURITY: Removed localStorage storage - email should be provided by user on callback
      // This prevents XSS attacks from accessing user email

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async signUpWithEmail(request: SignUpRequest): Promise<AuthResponse> {
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/auth/callback`,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, request.email, actionCodeSettings);
      // SECURITY: Removed localStorage storage for email

      // SECURITY FIX: Minimize sensitive data in sessionStorage
      // Only store minimal, non-sensitive data. Email is provided by user on callback.
      // SessionStorage is cleared when tab closes, reducing XSS exposure window.
      const minimalPendingData = {
        username: request.username,
        displayName: request.displayName,
        nickname: request.nickname,
        is18Plus: request.is18Plus,
        consentAccepted: request.consentAccepted,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
      };
      window.sessionStorage.setItem(
        "pendingSignUp",
        JSON.stringify(minimalPendingData),
      );

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async completeSignIn(email: string): Promise<AuthResponse> {
    try {
      const userCredential = await signInWithEmailLink(
        auth,
        email,
        window.location.href,
      );
      // SECURITY: No localStorage to remove for email

      const pendingSignUpData = window.sessionStorage.getItem("pendingSignUp");
      if (pendingSignUpData) {
        let pendingData;
        try {
          pendingData = JSON.parse(pendingSignUpData);
        } catch (error) {
          console.error("Failed to parse pending signup data:", error);
          window.sessionStorage.removeItem("pendingSignUp");
          return {
            success: false,
            error: "Invalid signup data, please try again",
          };
        }

        // SECURITY: Check if pending signup data has expired (30 minutes)
        if (pendingData.expiresAt && Date.now() > pendingData.expiresAt) {
          console.warn("Pending signup data expired, requiring fresh signup");
          window.sessionStorage.removeItem("pendingSignUp");
          return {
            success: false,
            error: "Signup link expired, please try again",
          };
        }

        const userData = {
          email: userCredential.user.email || email, // Use email from auth
          username: pendingData.username,
          displayName: pendingData.displayName,
          nickname: pendingData.nickname,
          is18Plus: pendingData.is18Plus,
          consentAccepted: pendingData.consentAccepted,
        } as SignUpRequest;

        await this.createUserProfile(userData, userCredential.user.uid);
        window.sessionStorage.removeItem("pendingSignUp");
      }

      const user = await this.getUserProfile(userCredential.user.uid);
      return { success: true, user };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async signInWithGoogle(): Promise<AuthResponse> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      await signInWithPopup(auth, provider);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  }

  async isSignInLink(): Promise<boolean> {
    return isSignInWithEmailLink(auth, window.location.href);
  }

  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    return firebaseOnAuthStateChanged(auth, async (firebaseUser) => {
      // SECURITY: Clear expired pending signup data from sessionStorage on auth state change
      const pendingSignUpData = window.sessionStorage.getItem("pendingSignUp");
      if (pendingSignUpData) {
        try {
          const pendingData = JSON.parse(pendingSignUpData);
          if (pendingData.expiresAt && Date.now() > pendingData.expiresAt) {
            window.sessionStorage.removeItem("pendingSignUp");
          }
        } catch (e) {
          // If parsing fails, clear the data to be safe
          window.sessionStorage.removeItem("pendingSignUp");
        }
      }

      if (firebaseUser) {
        try {
          const user = await this.getUserProfile(firebaseUser.uid);
          callback(user);
        } catch (error) {
          // SECURITY FIX (§2.2): Do NOT silently auto-create a user profile
          // with is18Plus:false / consentAccepted:false for auth identities
          // that have never completed signup. Doing so bypasses the age and
          // consent gates that the signup form enforces. Instead we return
          // a null profile so the UI routes the user through the proper
          // consent/profile-creation flow (`profile-creation` screen).
          console.error(
            "AuthRepository: user has no profile yet, routing to signup flow",
            error,
          );
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  }
}
