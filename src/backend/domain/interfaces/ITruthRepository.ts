// Truth Repository Interface - Pure data access layer
// Follows architecture contract strictly

export interface Truth {
  id: string;
  challenger_id: string;
  receiver_id: string;
  question: string;
  state: "SENT" | "ANSWERED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  answer?: string;
  votes?: { truth: number; lie: number; total: number };
  created_at: string;
  updated_at: string;
  answered_at?: string;
  reviewed_at?: string;
}

export interface CreateTruthRequest {
  challenger_id: string;
  receiver_id: string;
  question: string;
}

export interface UpdateTruthRequest {
  state?: Truth["state"];
  answer?: string;
  votes?: { truth: number; lie: number; total: number };
  answered_at?: string;
  reviewed_at?: string;
}

export interface TruthVote {
  id: string;
  truth_id: string;
  voter_id: string;
  vote: "TRUTH" | "LIE";
  created_at: string;
}

export interface ITruthRepository {
  createTruth(request: CreateTruthRequest): Promise<Truth>;
  getTruthById(truthId: string): Promise<Truth | null>;
  getUserTruths(
    userId: string,
    type?: "sent" | "received" | "all",
  ): Promise<Truth[]>;
  updateTruth(truthId: string, updates: UpdateTruthRequest): Promise<Truth>;
  answerTruth(truthId: string, answer: string): Promise<Truth>;
  voteOnTruth(
    truthId: string,
    voterId: string,
    vote: "TRUTH" | "LIE",
  ): Promise<void>;
  getTruthVotes(truthId: string): Promise<TruthVote[]>;
  canTruthUser(challengerId: string, receiverId: string): Promise<boolean>;
  deleteTruth(truthId: string): Promise<void>;
  subscribeToUserTruths(
    userId: string,
    type: "sent" | "received" | "all",
    callback: (truths: Truth[]) => void,
  ): () => void;
}
