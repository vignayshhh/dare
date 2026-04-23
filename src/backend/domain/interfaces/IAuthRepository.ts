export interface AuthUser {
  userId: string;
  email: string;
  username: string;
  nickname: string;
  displayName: string;
  is18Plus: boolean;
  consentAccepted: boolean;
  visibility: "PUBLIC" | "PRIVATE";
  daresCompleted: number;
  daresRefused: number;
  ghostModeActive: boolean;
  ghostModeExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
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

export interface IAuthRepository {
  getUserProfile(userId: string): Promise<AuthUser>;
  createUserProfile(userData: SignUpRequest, userId: string): Promise<AuthUser>;
  updateUserProfile(
    userId: string,
    updates: Partial<AuthUser>,
  ): Promise<AuthUser>;
  signInWithEmail(email: string): Promise<AuthResponse>;
  signUpWithEmail(request: SignUpRequest): Promise<AuthResponse>;
  completeSignIn(email: string): Promise<AuthResponse>;
  signInWithGoogle(): Promise<AuthResponse>;
  signOut(): Promise<void>;
  isSignInLink(): Promise<boolean>;
  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void;
}
