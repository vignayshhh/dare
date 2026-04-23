export type FriendshipStatus = "pending" | "accepted" | "rejected";

export interface FriendshipResponse {
  success: boolean;
  friendship?: any;
  error?: string;
}

export interface FriendListResponse {
  success: boolean;
  friends?: any[];
  error?: string;
}

export interface PendingRequestsResponse {
  success: boolean;
  requests?: any[];
  error?: string;
}

export interface SearchUsersResponse {
  success: boolean;
  users?: any[];
  error?: string;
}

export interface SendFriendRequestRequest {
  addresseeId: string;
}

export interface RespondToFriendRequestRequest {
  friendshipId: string;
  action: "accept" | "reject";
}

export interface RemoveFriendRequest {
  friendshipId: string;
}

export interface SearchUsersRequest {
  query: string;
}
