import dareServiceNew, {
  CreateDareRequest as CreateDareRequestNew,
} from "./dare.service.new";
import { DareEntity, VoteType as EntityVoteType } from "@/backend/domain/entities/Dare";
import { DareRepository } from "@/backend/repositories/DareRepository";
import { UserRepository } from "@/backend/repositories/UserRepository";

export type VoteType = "REAL" | "FAKE";

export interface CreateDareRequest {
  challenger_id: string;
  receiver_id: string;
  description: string;
}

export interface DareProof {
  media_url: string;
  media_type: "TEXT" | "PHOTO" | "VIDEO";
}

export interface DareWithUsers {
  id: string;
  challenger_id: string;
  receiver_id: string;
  description: string;
  state:
    | "SENT"
    | "ACCEPTED"
    | "CHICKEN_OUT"
    | "PROOF_SUBMITTED"
    | "UNDER_REVIEW"
    | "FRIENDS_VALIDATION"
    | "ACCEPTED_REAL"
    | "REJECTED_FAKE";
  created_at: string;
  updated_at: string;
  accepted_at?: string | null;
  proof_submitted_at?: string | null;
  completed_at?: string | null;
  ghost_mode_until?: string | null;
  proof_media_url?: string | null;
  proof_media_type?: "TEXT" | "PHOTO" | "VIDEO" | null;
  challenger?: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  receiver?: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  votes?: Array<{
    dare_id: string;
    voter_id: string;
    vote: VoteType;
    created_at: string;
  }>;
}

const dareRepository = new DareRepository();
const userRepository = new UserRepository();

function toCompatDare(dare: DareEntity): DareWithUsers {
  return {
    id: dare.id,
    challenger_id: dare.challengerId,
    receiver_id: dare.receiverId,
    description: dare.description,
    state: dare.state,
    created_at: dare.createdAt,
    updated_at: dare.updatedAt,
    accepted_at: dare.acceptedAt,
    proof_submitted_at: dare.proofSubmittedAt,
    completed_at: dare.completedAt,
    ghost_mode_until: dare.ghostModeUntil,
    proof_media_url: dare.proofMediaUrl,
    proof_media_type: dare.proofMediaType,
  };
}

async function withUsers(dare: DareWithUsers): Promise<DareWithUsers> {
  const [challenger, receiver] = await Promise.all([
    userRepository.getProfileById(dare.challenger_id),
    userRepository.getProfileById(dare.receiver_id),
  ]);

  return {
    ...dare,
    challenger: {
      id: challenger?.userId || dare.challenger_id,
      user_id: challenger?.userId || dare.challenger_id,
      username: challenger?.username || "unknown",
      display_name: challenger?.displayName || null,
      avatar_url: challenger?.avatarUrl || null,
    },
    receiver: {
      id: receiver?.userId || dare.receiver_id,
      user_id: receiver?.userId || dare.receiver_id,
      username: receiver?.username || "unknown",
      display_name: receiver?.displayName || null,
      avatar_url: receiver?.avatarUrl || null,
    },
  };
}

class DareServiceCompat {
  async getDare(dareId: string): Promise<DareWithUsers | null> {
    const response = await dareServiceNew.getDareById(dareId);
    if (!response.success || !response.dare) return null;
    return toCompatDare(response.dare);
  }

  async getDaresForUser(
    userId: string,
    role?: "challenger" | "receiver",
  ): Promise<DareWithUsers[]> {
    const response = await dareServiceNew.getDaresForUser(userId);
    if (!response.success || !response.dares) return [];

    let dares = response.dares.map(toCompatDare);
    if (role === "challenger") {
      dares = dares.filter((d) => d.challenger_id === userId);
    } else if (role === "receiver") {
      dares = dares.filter((d) => d.receiver_id === userId);
    }

    return Promise.all(dares.map(withUsers));
  }

  async createDare(request: CreateDareRequest): Promise<DareWithUsers> {
    const mapped: CreateDareRequestNew = {
      challengerId: request.challenger_id,
      receiverId: request.receiver_id,
      description: request.description,
    };
    const response = await dareServiceNew.createDare(mapped);
    if (!response.success || !response.dare) {
      throw new Error(response.error || "Failed to create dare");
    }
    return withUsers(toCompatDare(response.dare));
  }

  async getDareWithUsers(
    dareId: string,
    _currentUserId?: string,
  ): Promise<DareWithUsers | null> {
    const response = await dareServiceNew.getDareById(dareId);
    if (!response.success || !response.dare) return null;
    return withUsers(toCompatDare(response.dare));
  }

  async acceptDare(dareId: string, receiverId: string): Promise<void> {
    const response = await dareServiceNew.acceptDare(dareId, receiverId);
    if (!response.success) throw new Error(response.error || "Failed to accept dare");
  }

  async rejectDare(dareId: string, receiverId: string): Promise<void> {
    const response = await dareServiceNew.chickenOut(dareId, receiverId);
    if (!response.success) throw new Error(response.error || "Failed to reject dare");
  }

  async submitProof(
    dareId: string,
    receiverId: string,
    proof: DareProof,
  ): Promise<void> {
    const response = await dareServiceNew.submitProof(
      dareId,
      receiverId,
      proof.media_url,
      proof.media_type,
    );
    if (!response.success) throw new Error(response.error || "Failed to submit proof");
  }

  async voteOnDare(dareId: string, voterId: string, vote: VoteType): Promise<void> {
    const normalized = vote.toUpperCase() as EntityVoteType;
    const response = await dareServiceNew.voteOnDare(dareId, voterId, normalized);
    if (!response.success) throw new Error(response.error || "Failed to vote on dare");
  }

  async challengerReviewDare(
    dareId: string,
    challengerId: string,
    decision: "ACCEPT" | "REJECT",
  ): Promise<void> {
    const response = await dareServiceNew.challengerReviewDare(
      dareId,
      challengerId,
      decision,
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to review dare");
    }
  }

  async approveDare(dareId: string): Promise<void> {
    await dareRepository.updateDare(dareId, {
      state: "ACCEPTED_REAL",
    });
  }

  async rejectDareByFriends(dareId: string): Promise<void> {
    await dareRepository.updateDare(dareId, {
      state: "REJECTED_FAKE",
    });
  }

  async getActiveDareBetweenUsers(
    userId1: string,
    userId2: string,
  ): Promise<DareWithUsers | null> {
    const [d1, d2] = await Promise.all([
      dareRepository.getDaresByUserId(userId1),
      dareRepository.getDaresByUserId(userId2),
    ]);
    const all = [...d1, ...d2];
    const active = all.find(
      (d) =>
        ((d.challengerId === userId1 && d.receiverId === userId2) ||
          (d.challengerId === userId2 && d.receiverId === userId1)) &&
        ["SENT", "ACCEPTED", "PROOF_SUBMITTED", "FRIENDS_VALIDATION"].includes(
          d.state,
        ),
    );
    return active ? withUsers(toCompatDare(DareEntity.create(active))) : null;
  }
}

export const dareService = new DareServiceCompat();
