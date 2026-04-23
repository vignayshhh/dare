// Simple auth service for development/testing
// Provides basic user structure for data adapters

import { getDefaultAvatarUrl } from "@/utils/placeholderImages";

export interface SimpleUser {
  user_id: string;
  nickname: string;
  display_name: string;
  avatar?: string;
  email?: string;
}

// Simple user service for development purposes
export class SimpleAuthService {
  // Create a simple user from basic data
  static createSimpleUser(data: {
    user_id: string;
    nickname: string;
    display_name: string;
    avatar?: string;
    email?: string;
  }): SimpleUser {
    return {
      user_id: data.user_id,
      nickname: data.nickname,
      display_name: data.display_name,
      avatar: data.avatar || getDefaultAvatarUrl(data.user_id),
      email: data.email,
    };
  }

  // Convert from AuthUser to SimpleUser
  static fromAuthUser(authUser: any): SimpleUser {
    return {
      user_id: authUser.id,
      nickname: authUser.username,
      display_name: authUser.displayName,
      avatar: authUser.avatar || getDefaultAvatarUrl(authUser.id),
      email: authUser.email,
    };
  }
}
