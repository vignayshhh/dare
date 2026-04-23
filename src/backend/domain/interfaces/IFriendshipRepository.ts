export type FriendshipStatus = "pending" | "accepted" | "rejected";

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  acceptedAt: string | null;
}

export interface CreateFriendshipRequest {
  requesterId: string;
  addresseeId: string;
}

export interface IFriendshipRepository {
  createFriendship(request: CreateFriendshipRequest): Promise<Friendship>;
  getFriendshipById(friendshipId: string): Promise<Friendship | null>;
  getFriendshipBetweenUsers(user1Id: string, user2Id: string): Promise<Friendship | null>;
  getFriendshipsForUser(userId: string): Promise<Friendship[]>;
  getPendingFriendships(userId: string): Promise<Friendship[]>;
  getAcceptedFriends(userId: string): Promise<Friendship[]>;
  updateFriendshipStatus(friendshipId: string, status: FriendshipStatus): Promise<Friendship>;
  areUsersFriends(user1Id: string, user2Id: string): Promise<boolean>;
  deleteFriendship(friendshipId: string): Promise<void>;
}
