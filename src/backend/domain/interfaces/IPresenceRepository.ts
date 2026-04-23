export interface Presence {
  id: string;
  userId: string;
  isOnline: boolean;
  lastSeen: string;
  currentProfileViewing: string | null;
  typingInChatWith: string | null;
  ghostMode: boolean;
  updatedAt: string;
}

export interface UpdatePresenceRequest {
  isOnline?: boolean;
  currentProfileViewing?: string;
  typingInChatWith?: string;
  ghostMode?: boolean;
}

export interface IPresenceRepository {
  getPresenceByUserId(userId: string): Promise<Presence | null>;
  updatePresence(
    userId: string,
    updates: UpdatePresenceRequest,
  ): Promise<Presence>;
  setOnlineStatus(userId: string, isOnline: boolean): Promise<Presence>;
  setCurrentProfileViewing(
    userId: string,
    profileId: string,
  ): Promise<Presence>;
  setTypingInChat(userId: string, chatUserId: string): Promise<Presence>;
  clearTypingInChat(userId: string): Promise<Presence>;
  setGhostMode(userId: string, ghostMode: boolean): Promise<Presence>;
  getOnlineUsers(): Promise<Presence[]>;
  getUsersViewingProfile(profileId: string): Promise<Presence[]>;
  ensurePresenceExists(userId: string): Promise<Presence>;
}
