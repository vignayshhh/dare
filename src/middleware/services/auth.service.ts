import { auth, db } from "@/backend/lib/firebase";
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
import { accountLockoutService } from "@/security/accountLockout";
import { secureSessionStorage } from "@/security/sessionEncryption";

export interface User {
  user_id: string;
  email: string;
  username: string;
  nickname: string;
  display_name: string;
  is_18_plus: boolean;
  consent_accepted: boolean;
  visibility: "PUBLIC" | "PRIVATE";
  dares_completed: number;
  dares_refused: number;
  ghost_mode_active: boolean;
  ghost_mode_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  error?: string;
}

export interface SignUpRequest {
  email: string;
  username: string;
  nickname: string;
  displayName: string;
  is18Plus: boolean;
  consentAccepted: boolean;
}

class AuthService {
  private authState: AuthState = {
    user: null,
    loading: true,
    error: null,
  };

  private listeners: ((state: AuthState) => void)[] = [];
  private isInitialized = false;

  subscribe(listener: (state: AuthState) => void) {
    this.listeners.push(listener);
    listener(this.authState);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private updateAuthState(updates: Partial<AuthState>) {
    this.authState = { ...this.authState, ...updates };
    this.listeners.forEach((listener) => listener(this.authState));
  }

  getCurrentState(): AuthState {
    return this.authState;
  }

  async initializeAuth() {
    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;

    // Check if Firebase Auth is available
    if (!auth) {
      console.warn("⚠️ Firebase Auth not configured. Running in mock mode.");
      this.updateAuthState({
        user: null,
        loading: false,
        error: null,
      });
      return;
    }

    firebaseOnAuthStateChanged(auth, async (user) => {
      if (user) {
        this.updateAuthState({ loading: true, error: null });

        try {
          const profile = await this.getUserProfile(user.uid);
          this.updateAuthState({
            user: profile,
            loading: false,
            error: null,
          });
        } catch (error) {
          // SECURITY FIX: Create profile with consent set to FALSE by default.
          // User must complete explicit consent flow before accessing the app.
          // This prevents silent consent bypass while not breaking the auth flow.
          const userRef = doc(db, "users", user.uid);
          await setDoc(userRef, {
            user_id: user.uid,
            email: user.email,
            username: user.email?.split("@")[0] || "user",
            display_name: user.displayName || "Anonymous",
            is_18_plus: false, // SECURITY: Must be explicitly set to true via consent screen
            consent_accepted: false, // SECURITY: Must be explicitly accepted
            visibility: "PUBLIC",
            dares_completed: 0,
            dares_refused: 0,
            ghost_mode_active: false,
            ghost_mode_expires_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          const profile = await this.getUserProfile(user.uid);
          this.updateAuthState({
            user: profile,
            loading: false,
            error: null,
          });
        }
      } else {
        this.updateAuthState({
          user: null,
          loading: false,
          error: null,
        });
      }
    });
  }

  private async loadInitialSession() {
    try {
      const user = auth.currentUser;
      if (user) {
        const profile = await this.getUserProfile(user.uid);
        this.updateAuthState({
          user: profile,
          loading: false,
          error: null,
        });
      } else {
        this.updateAuthState({
          user: null,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      this.updateAuthState({
        user: null,
        loading: false,
        error: "Failed to load session",
      });
    }
  }

  private async getUserProfile(userId: string): Promise<User> {
    try {
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        throw new Error("User profile not found");
      }

      return userDoc.data() as User;
    } catch (error) {
      console.error("getUserProfile error:", error);
      throw error;
    }
  }

  async signUp(request: SignUpRequest): Promise<AuthResponse> {
    // Check if Firebase Auth is available
    if (!auth) {
      return {
        success: false,
        error:
          "Firebase not configured. Please set up Firebase credentials in .env.local",
      };
    }

    try {
      this.updateAuthState({ loading: true, error: null });

      const actionCodeSettings = {
        url: `${window.location.origin}/auth/callback`,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, request.email, actionCodeSettings);
      await secureSessionStorage.setItem("emailForSignIn", request.email);
      await secureSessionStorage.setItem(
        "pendingSignUp",
        JSON.stringify({
          email: request.email,
          username: request.username,
          nickname: request.nickname,
          displayName: request.displayName,
          is18Plus: request.is18Plus,
          consentAccepted: request.consentAccepted,
        }),
      );

      this.updateAuthState({ loading: false });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.updateAuthState({
        loading: false,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  async signIn(email: string): Promise<AuthResponse> {
    // Check if Firebase Auth is available
    if (!auth) {
      return {
        success: false,
        error:
          "Firebase not configured. Please set up Firebase credentials in .env.local",
      };
    }

    try {
      this.updateAuthState({ loading: true, error: null });

      // Check if account is locked
      const lockoutStatus = await accountLockoutService.isAccountLocked(email);
      if (lockoutStatus.locked) {
        this.updateAuthState({ loading: false });
        return {
          success: false,
          error:
            lockoutStatus.reason ||
            "Account is temporarily locked due to too many failed attempts.",
        };
      }

      const actionCodeSettings = {
        url: `${window.location.origin}/auth/callback`,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      await secureSessionStorage.setItem("emailForSignIn", email);

      this.updateAuthState({ loading: false });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Record failed attempt for account lockout
      await accountLockoutService.recordFailedAttempt(email);

      this.updateAuthState({
        loading: false,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  async completeSignIn(email: string): Promise<AuthResponse> {
    // Check if Firebase Auth is available
    if (!auth || !db) {
      return {
        success: false,
        error:
          "Firebase not configured. Please set up Firebase credentials in .env.local",
      };
    }

    try {
      this.updateAuthState({ loading: true, error: null });

      // Check if account is locked before completing sign-in
      const lockoutStatus = await accountLockoutService.isAccountLocked(email);
      if (lockoutStatus.locked) {
        this.updateAuthState({ loading: false });
        return {
          success: false,
          error:
            lockoutStatus.reason ||
            "Account is temporarily locked due to too many failed attempts.",
        };
      }

      const userCredential = await signInWithEmailLink(
        auth,
        email,
        window.location.href,
      );

      await secureSessionStorage.removeItem("emailForSignIn");

      const pendingSignUpData =
        await secureSessionStorage.getItem("pendingSignUp");
      if (pendingSignUpData) {
        let userData;
        try {
          userData = JSON.parse(pendingSignUpData);
        } catch (error) {
          console.error("Failed to parse pending signup data:", error);
          secureSessionStorage.removeItem("pendingSignUp");
          return { success: false, error: "Invalid signup data" };
        }

        const userRef = doc(db, "users", userCredential.user.uid);
        await setDoc(userRef, {
          user_id: userCredential.user.uid,
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        secureSessionStorage.removeItem("pendingSignUp");
      }

      const profile = await this.getUserProfile(userCredential.user.uid);
      this.updateAuthState({
        user: profile,
        loading: false,
        error: null,
      });

      return { success: true, user: profile };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Record failed attempt for account lockout
      await accountLockoutService.recordFailedAttempt(email);

      this.updateAuthState({
        loading: false,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  async isSignInLink(): Promise<boolean> {
    // Check if Firebase Auth is available
    if (!auth) {
      return false;
    }
    return isSignInWithEmailLink(auth, window.location.href);
  }

  async signInWithGoogle(): Promise<AuthResponse> {
    // Check if Firebase Auth is available
    if (!auth) {
      return {
        success: false,
        error:
          "Firebase not configured. Please set up Firebase credentials in .env.local",
      };
    }

    try {
      this.updateAuthState({ loading: true, error: null });

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.updateAuthState({
        loading: false,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  async signOut(): Promise<void> {
    // Check if Firebase Auth is available
    if (!auth) {
      this.updateAuthState({
        user: null,
        loading: false,
        error: null,
      });
      return;
    }

    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  }

  async updateProfile(updates: Partial<User>): Promise<AuthResponse> {
    // Check if Firebase is available
    if (!auth || !db) {
      return {
        success: false,
        error:
          "Firebase not configured. Please set up Firebase credentials in .env.local",
      };
    }

    try {
      if (!this.authState.user) {
        return { success: false, error: "Not authenticated" };
      }

      this.updateAuthState({ loading: true, error: null });

      const userRef = doc(db, "users", this.authState.user.user_id);
      await updateDoc(userRef, {
        ...updates,
        updated_at: serverTimestamp(),
      });

      const updatedProfile = await this.getUserProfile(
        this.authState.user.user_id,
      );
      this.updateAuthState({ user: updatedProfile });

      return { success: true, user: updatedProfile };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.updateAuthState({
        loading: false,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  isAuthenticated(): boolean {
    return !!this.authState.user;
  }

  getCurrentUser(): User | null {
    return this.authState.user;
  }
}

const authService = new AuthService();
export default authService;
