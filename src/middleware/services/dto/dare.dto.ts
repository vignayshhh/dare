export type DareState = "SENT" | "ACCEPTED" | "CHICKEN_OUT" | "PROOF_SUBMITTED" | "UNDER_REVIEW" | "FRIENDS_VALIDATION" | "ACCEPTED_REAL" | "REJECTED_FAKE";
export type VoteType = "REAL" | "FAKE";

export interface DareResponse {
  success: boolean;
  dare?: any;
  error?: string;
}

export interface DareListResponse {
  success: boolean;
  dares?: any[];
  error?: string;
}

export interface CreateDareRequest {
  challengerId: string;
  receiverId: string;
  description: string;
}

export interface SubmitProofRequest {
  dareId: string;
  mediaUrl: string;
  mediaType: "TEXT" | "PHOTO" | "VIDEO";
}

export interface VoteRequest {
  dareId: string;
  vote: VoteType;
}

export interface VoteResponse {
  success: boolean;
  error?: string;
}

export interface AcceptDareRequest {
  dareId: string;
}

export interface ChickenOutRequest {
  dareId: string;
}
