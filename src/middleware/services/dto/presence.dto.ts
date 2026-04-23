export interface PresenceResponse {
  success: boolean;
  presence?: any;
  error?: string;
}

export interface OnlineUsersResponse {
  success: boolean;
  users?: any[];
  error?: string;
}

export interface ProfileViewersResponse {
  success: boolean;
  viewers?: any[];
  error?: string;
}

export interface UpdatePresenceRequest {
  isOnline?: boolean;
  currentProfileViewing?: string;
  typingInChatWith?: string;
  ghostMode?: boolean;
}

export interface SetOnlineStatusRequest {
  isOnline: boolean;
}

export interface SetProfileViewingRequest {
  profileId: string;
}

export interface SetTypingInChatRequest {
  chatUserId: string;
}

export interface SetGhostModeRequest {
  ghostMode: boolean;
}
