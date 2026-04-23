import { IAuthRepository } from "@/backend/domain/interfaces/IAuthRepository";
import { AuthRepository } from "@/backend/repositories/AuthRepository";
import { AuthUserEntity } from "@/backend/domain/entities/AuthUser";

export interface AuthState {
  user: AuthUserEntity | null;
  loading: boolean;
  error: string | null;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUserEntity;
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
  private authRepository: IAuthRepository;
  private authState: AuthState = {
    user: null,
    loading: true,
    error: null,
  };
  private listeners: ((state: AuthState) => void)[] = [];
  private isInitialized = false;
  private authStateChangeCount = 0;

  constructor(authRepository?: IAuthRepository) {
    this.authRepository = authRepository || new AuthRepository();
  }

  subscribe(listener: (state: AuthState) => void) {
    this.listeners.push(listener);
    listener(this.authState);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private updateAuthState(updates: Partial<AuthState>) {
    const oldState = { ...this.authState };
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

    this.authRepository.onAuthStateChanged(async (authUser: any) => {
      if (authUser) {
        this.updateAuthState({ loading: true, error: null });

        try {
          const userEntity = AuthUserEntity.create({
            userId: authUser.userId,
            email: authUser.email,
            username: authUser.username,
            nickname: authUser.nickname || authUser.displayName,
            displayName: authUser.displayName,
            is18Plus: authUser.is18Plus,
            consentAccepted: authUser.consentAccepted,
            visibility: authUser.visibility,
            daresCompleted: authUser.daresCompleted,
            daresRefused: authUser.daresRefused,
            ghostModeActive: authUser.ghostModeActive,
            ghostModeExpiresAt: authUser.ghostModeExpiresAt,
            createdAt: authUser.createdAt,
            updatedAt: authUser.updatedAt,
          });

          this.updateAuthState({
            user: userEntity,
            loading: false,
            error: null,
          });
        } catch (error) {
          console.error("❌ Error processing user profile:", error);
          this.updateAuthState({
            user: null,
            loading: false,
            error: "Failed to process user profile",
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

  async signUp(request: SignUpRequest): Promise<AuthResponse> {
    try {
      this.updateAuthState({ loading: true, error: null });

      const response = await this.authRepository.signUpWithEmail(request);

      if (response.success) {
        this.updateAuthState({ loading: false });
        return { success: true };
      } else {
        this.updateAuthState({
          loading: false,
          error: response.error,
        });
        return { success: false, error: response.error };
      }
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
    try {
      this.updateAuthState({ loading: true, error: null });

      const response = await this.authRepository.signInWithEmail(email);

      if (response.success) {
        this.updateAuthState({ loading: false });
        return { success: true };
      } else {
        this.updateAuthState({
          loading: false,
          error: response.error,
        });
        return { success: false, error: response.error };
      }
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

  async completeSignIn(email: string): Promise<AuthResponse> {
    try {
      this.updateAuthState({ loading: true, error: null });

      const response = await this.authRepository.completeSignIn(email);

      if (response.success && response.user) {
        const userEntity = AuthUserEntity.create({
          userId: response.user.userId,
          email: response.user.email,
          username: response.user.username,
          nickname: response.user.nickname,
          displayName: response.user.displayName,
          is18Plus: response.user.is18Plus,
          consentAccepted: response.user.consentAccepted,
          visibility: response.user.visibility,
          daresCompleted: response.user.daresCompleted,
          daresRefused: response.user.daresRefused,
          ghostModeActive: response.user.ghostModeActive,
          ghostModeExpiresAt: response.user.ghostModeExpiresAt,
          createdAt: response.user.createdAt,
          updatedAt: response.user.updatedAt,
        });

        this.updateAuthState({
          user: userEntity,
          loading: false,
          error: null,
        });

        return { success: true, user: userEntity };
      } else {
        this.updateAuthState({
          loading: false,
          error: response.error,
        });
        return { success: false, error: response.error };
      }
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

  async isSignInLink(): Promise<boolean> {
    return this.authRepository.isSignInLink();
  }

  async signInWithGoogle(): Promise<AuthResponse> {
    try {
      this.updateAuthState({ loading: true, error: null });

      const response = await this.authRepository.signInWithGoogle();

      if (response.success) {
        console.log(
          "✅ Google sign-in completed - waiting for auth state change",
        );
        return { success: true };
      } else {
        console.error("❌ Google sign-in error:", response.error);
        this.updateAuthState({
          loading: false,
          error: response.error,
        });
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error("❌ Google sign-in error:", error);
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
    try {
      await this.authRepository.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  }

  async updateProfile(updates: Partial<AuthUserEntity>): Promise<AuthResponse> {
    try {
      if (!this.authState.user) {
        return { success: false, error: "Not authenticated" };
      }

      this.updateAuthState({ loading: true, error: null });

      const repositoryUpdates = {
        displayName: updates.displayName,
        visibility: updates.visibility,
        ghostModeActive: updates.ghostModeActive,
      };

      const updatedUser = await this.authRepository.updateUserProfile(
        this.authState.user.userId,
        repositoryUpdates,
      );

      const userEntity = AuthUserEntity.create({
        userId: updatedUser.userId,
        email: updatedUser.email,
        username: updatedUser.username,
        nickname: updatedUser.nickname,
        displayName: updatedUser.displayName,
        is18Plus: updatedUser.is18Plus,
        consentAccepted: updatedUser.consentAccepted,
        visibility: updatedUser.visibility,
        daresCompleted: updatedUser.daresCompleted,
        daresRefused: updatedUser.daresRefused,
        ghostModeActive: updatedUser.ghostModeActive,
        ghostModeExpiresAt: updatedUser.ghostModeExpiresAt,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      });

      this.updateAuthState({ user: userEntity });

      return { success: true, user: userEntity };
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

  getCurrentUser(): AuthUserEntity | null {
    return this.authState.user;
  }
}

const authService = new AuthService();
export default authService;
