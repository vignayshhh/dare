export type DareState =
  | "SENT"
  | "ACCEPTED"
  | "CHICKEN_OUT"
  | "PROOF_SUBMITTED"
  | "UNDER_REVIEW"
  | "FRIENDS_VALIDATION"
  | "ACCEPTED_REAL"
  | "REJECTED_FAKE";
export type VoteType = "REAL" | "FAKE";

export interface Dare {
  id: string;
  challengerId: string;
  receiverId: string;
  description: string;
  state: DareState;
  proofMediaUrl: string | null;
  proofMediaType: "TEXT" | "PHOTO" | "VIDEO" | null;
  proofThumbnailUrl: string | null;
  challengerVote: VoteType | null;
  validationThresholdMet: boolean;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  proofSubmittedAt: string | null;
  completedAt: string | null;
  ghostModeUntil: string | null; // Timer field
}

export interface DareVote {
  id: string;
  dareId: string;
  voterId: string;
  vote: VoteType;
  createdAt: string;
}

export interface CreateDareRequest {
  challengerId: string;
  receiverId: string;
  description: string;
}

export interface UpdateDareRequest {
  state?: DareState;
  proofMediaUrl?: string;
  proofMediaType?: "TEXT" | "PHOTO" | "VIDEO";
  proofThumbnailUrl?: string;
  challengerVote?: VoteType;
}

export interface IDareRepository {
  createDare(request: CreateDareRequest): Promise<Dare>;
  getDareById(dareId: string): Promise<Dare | null>;
  getDaresByUserId(userId: string): Promise<Dare[]>;
  getReceivedDares(userId: string): Promise<Dare[]>;
  getSentDares(userId: string): Promise<Dare[]>;
  updateDare(dareId: string, updates: UpdateDareRequest): Promise<Dare>;
  submitProof(
    dareId: string,
    mediaUrl: string,
    mediaType: "TEXT" | "PHOTO" | "VIDEO",
    thumbnailUrl?: string,
  ): Promise<Dare>;
  voteOnDare(
    dareId: string,
    voterId: string,
    vote: VoteType,
  ): Promise<DareVote>;
  getDareVotes(dareId: string): Promise<DareVote[]>;
  canDareUser(challengerId: string, receiverId: string): Promise<boolean>;
  getActiveDaresCount(userId: string): Promise<number>;
  deleteDare(dareId: string): Promise<void>;
  getDaresFromUserAndFriends(
    userId: string,
    friendIds: string[],
  ): Promise<Dare[]>;
  subscribeToUserDares(
    userId: string,
    type: "sent" | "received" | "all",
    callback: (dares: Dare[]) => void,
  ): () => void;
}
