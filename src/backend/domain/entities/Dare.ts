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

export class DareEntity {
  constructor(
    public readonly id: string,
    public readonly challengerId: string,
    public readonly receiverId: string,
    public readonly description: string,
    public readonly state: DareState,
    public readonly proofMediaUrl: string | null,
    public readonly proofMediaType: "TEXT" | "PHOTO" | "VIDEO" | null,
    public readonly challengerVote: VoteType | null,
    public readonly validationThresholdMet: boolean,
    public readonly createdAt: string,
    public readonly updatedAt: string,
    public readonly acceptedAt: string | null,
    public readonly proofSubmittedAt: string | null,
    public readonly completedAt: string | null,
    // Timer/ghost mode fields
    public readonly ghostModeUntil: string | null,
  ) {}

  static create(data: {
    id: string;
    challengerId: string;
    receiverId: string;
    description: string;
    state: DareState;
    proofMediaUrl: string | null;
    proofMediaType: "TEXT" | "PHOTO" | "VIDEO" | null;
    challengerVote: VoteType | null;
    validationThresholdMet: boolean;
    createdAt: string;
    updatedAt: string;
    acceptedAt: string | null;
    proofSubmittedAt: string | null;
    completedAt: string | null;
    ghostModeUntil: string | null;
  }): DareEntity {
    return new DareEntity(
      data.id,
      data.challengerId,
      data.receiverId,
      data.description,
      data.state,
      data.proofMediaUrl,
      data.proofMediaType,
      data.challengerVote,
      data.validationThresholdMet,
      data.createdAt,
      data.updatedAt,
      data.acceptedAt,
      data.proofSubmittedAt,
      data.completedAt,
      data.ghostModeUntil,
    );
  }

  canBeAccepted(): boolean {
    return this.state === "SENT";
  }

  canSubmitProof(): boolean {
    console.log("🔍 [DARE ENTITY] canSubmitProof check:", {
      currentState: this.state,
      expectedState: "ACCEPTED",
      result: this.state === "ACCEPTED",
      ghostModeUntil: this.ghostModeUntil,
      isInGhostMode: this.isInGhostMode(),
    });
    return this.state === "ACCEPTED";
  }

  isInGhostMode(): boolean {
    if (!this.ghostModeUntil) return false;
    return new Date() < new Date(this.ghostModeUntil);
  }

  getGhostModeRemainingMinutes(): number {
    if (!this.ghostModeUntil) return 0;
    const now = new Date();
    const expiry = new Date(this.ghostModeUntil);
    const diff = expiry.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60)));
  }

  canVote(voterId: string): boolean {
    return (
      this.state === "FRIENDS_VALIDATION" &&
      voterId !== this.challengerId &&
      voterId !== this.receiverId
    );
  }

  isCompleted(): boolean {
    return this.state === "ACCEPTED_REAL" || this.state === "REJECTED_FAKE";
  }

  accept(): DareEntity {
    if (!this.canBeAccepted()) {
      throw new Error("Dare cannot be accepted in current state");
    }

    const now = new Date();
    const ghostModeUntil = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

    return new DareEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.description,
      "ACCEPTED",
      this.proofMediaUrl,
      this.proofMediaType,
      this.challengerVote,
      this.validationThresholdMet,
      this.createdAt,
      new Date().toISOString(),
      new Date().toISOString(), // acceptedAt
      this.proofSubmittedAt,
      this.completedAt,
      ghostModeUntil.toISOString(), // ghostModeUntil
    );
  }

  submitProof(
    mediaUrl: string,
    mediaType: "TEXT" | "PHOTO" | "VIDEO",
  ): DareEntity {
    if (!this.canSubmitProof()) {
      throw new Error("Proof cannot be submitted in current state");
    }

    return new DareEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.description,
      "PROOF_SUBMITTED",
      mediaUrl,
      mediaType,
      this.challengerVote,
      this.validationThresholdMet,
      this.createdAt,
      new Date().toISOString(),
      this.acceptedAt,
      new Date().toISOString(), // proofSubmittedAt
      this.completedAt,
      this.ghostModeUntil,
    );
  }

  moveToValidation(): DareEntity {
    if (this.state !== "PROOF_SUBMITTED") {
      throw new Error(
        "Dare must be in PROOF_SUBMITTED state to move to validation",
      );
    }

    return new DareEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.description,
      "FRIENDS_VALIDATION",
      this.proofMediaUrl,
      this.proofMediaType,
      this.challengerVote,
      this.validationThresholdMet,
      this.createdAt,
      new Date().toISOString(),
      this.acceptedAt,
      this.proofSubmittedAt,
      this.completedAt,
      this.ghostModeUntil,
    );
  }

  completeAsReal(): DareEntity {
    return new DareEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.description,
      "ACCEPTED_REAL",
      this.proofMediaUrl,
      this.proofMediaType,
      this.challengerVote,
      this.validationThresholdMet,
      this.createdAt,
      new Date().toISOString(),
      this.acceptedAt,
      this.proofSubmittedAt,
      new Date().toISOString(), // completedAt
      this.ghostModeUntil,
    );
  }

  completeAsFake(): DareEntity {
    return new DareEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.description,
      "REJECTED_FAKE",
      this.proofMediaUrl,
      this.proofMediaType,
      this.challengerVote,
      this.validationThresholdMet,
      this.createdAt,
      new Date().toISOString(),
      this.acceptedAt,
      this.proofSubmittedAt,
      new Date().toISOString(), // completedAt
      this.ghostModeUntil,
    );
  }

  chickenOut(): DareEntity {
    return new DareEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.description,
      "CHICKEN_OUT",
      this.proofMediaUrl,
      this.proofMediaType,
      this.challengerVote,
      this.validationThresholdMet,
      this.createdAt,
      new Date().toISOString(),
      this.acceptedAt,
      this.proofSubmittedAt,
      this.completedAt,
      this.ghostModeUntil,
    );
  }
}
