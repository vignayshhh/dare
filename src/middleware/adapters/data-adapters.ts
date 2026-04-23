// Data adapters - Convert between UI interfaces and backend DTOs
// This ensures UI never knows about backend schema, following architecture contract

import { DareEntity, DareState } from "@/backend/domain/entities/Dare";
import { AuthUserEntity } from "@/backend/domain/entities/AuthUser";
import { getDefaultAvatarUrl } from "@/utils/placeholderImages";

// Import SimpleUser for development adapter
import { SimpleUser } from "@/middleware/services/simple-auth.service";

// UI Interfaces (from MainScreen.tsx)
export interface TruthPost {
  id: string;
  challengerId?: string;
  receiverId?: string;
  challenger: {
    nickname: string;
    avatar: string;
    verified?: boolean;
  };
  receiver: {
    nickname: string;
    avatar: string;
    verified?: boolean;
  };
  question: string;
  state: "SENT" | "ANSWERED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  createdAt: string;
  expiresAt?: string;
  answer?: string;
  poll?: {
    question: string;
    options: string[];
    votes: { [key: string]: number };
    totalVotes: number;
  };
}

export interface DarePost {
  id: string;
  challengerId?: string;
  receiverId?: string;
  challenger: {
    nickname: string;
    avatar: string;
    verified?: boolean;
  };
  receiver: {
    nickname: string;
    avatar: string;
    verified?: boolean;
  };
  description: string;
  proof?: { type: "image" | "video"; url: string; thumbnail?: string };
  state:
    | "SENT"
    | "ACCEPTED"
    | "CHICKEN_OUT"
    | "PROOF_SUBMITTED"
    | "UNDER_REVIEW"
    | "FRIENDS_VALIDATION"
    | "ACCEPTED_REAL"
    | "REJECTED_FAKE";
  createdAt: string;
  expiresAt?: string;
  votes?: {
    real: number;
    fake: number;
    userVote?: "real" | "fake";
    total?: number;
  };
}

// User profile interface for adapter
interface UserProfile {
  user_id: string;
  nickname: string;
  display_name: string;
  avatar?: string;
  verified?: boolean;
}

// Adapter functions - Convert backend entities to UI interfaces
export class DataAdapter {
  // Convert DareEntity to DarePost (UI interface) - requires user data
  static dareEntityToDarePost(
    entity: DareEntity,
    challengerProfile: UserProfile,
    receiverProfile: UserProfile,
    votes?: { real: number; fake: number; userVote?: "real" | "fake" },
  ): DarePost {
    return {
      id: entity.id,
      challenger: {
        nickname: challengerProfile.nickname,
        avatar: challengerProfile.avatar || "",
        verified: challengerProfile.verified,
      },
      receiver: {
        nickname: receiverProfile.nickname,
        avatar: receiverProfile.avatar || "",
        verified: receiverProfile.verified,
      },
      description: entity.description,
      proof: entity.proofMediaUrl
        ? {
            type: this.mapProofMediaType(entity.proofMediaType),
            url: entity.proofMediaUrl,
            thumbnail: entity.proofMediaUrl, // Use same URL for now
          }
        : undefined,
      state: this.mapDareState(entity.state),
      createdAt: entity.createdAt,
      votes: votes
        ? {
            real: votes.real,
            fake: votes.fake,
            userVote: votes.userVote,
            total: votes.real + votes.fake,
          }
        : undefined,
    };
  }

  // Convert AuthUserEntity to user profile format
  static authUserEntityToUserProfile(entity: AuthUserEntity): UserProfile {
    return {
      user_id: entity.userId,
      nickname: entity.nickname,
      display_name: entity.displayName,
      avatar: getDefaultAvatarUrl(entity.userId),
      verified: false, // Default to false until verification system is built
    };
  }

  // Convert SimpleUser to user profile format (for development)
  static simpleUserToUserProfile(entity: SimpleUser): UserProfile {
    return {
      user_id: entity.user_id,
      nickname: entity.nickname,
      display_name: entity.display_name,
      avatar: getDefaultAvatarUrl(entity.user_id),
      verified: false, // Default to false until verification system is built
    };
  }

  // Map backend proof media type to UI type
  private static mapProofMediaType(
    type: "TEXT" | "PHOTO" | "VIDEO" | null,
  ): "image" | "video" {
    if (type === "PHOTO") return "image";
    if (type === "VIDEO") return "video";
    return "image"; // Default fallback
  }

  // Map backend DareState to UI state strings
  private static mapDareState(state: DareState): DarePost["state"] {
    const stateMap: Record<DareState, DarePost["state"]> = {
      SENT: "SENT",
      ACCEPTED: "ACCEPTED",
      CHICKEN_OUT: "CHICKEN_OUT",
      PROOF_SUBMITTED: "PROOF_SUBMITTED",
      UNDER_REVIEW: "UNDER_REVIEW",
      FRIENDS_VALIDATION: "FRIENDS_VALIDATION",
      ACCEPTED_REAL: "ACCEPTED_REAL",
      REJECTED_FAKE: "REJECTED_FAKE",
    };
    return stateMap[state] || "SENT";
  }
}
