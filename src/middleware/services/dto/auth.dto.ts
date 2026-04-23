export interface AuthState {
  user: any;
  loading: boolean;
  error: string | null;
}

export interface AuthResponse {
  success: boolean;
  user?: any;
  error?: string;
}

export interface SignUpRequest {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  bio?: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  visibility?: "PUBLIC" | "PRIVATE";
  ghostModeActive?: boolean;
}
