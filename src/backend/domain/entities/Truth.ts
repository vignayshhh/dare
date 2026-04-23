// Truth Entity - Pure business logic, no external dependencies
// Follows architecture contract strictly

export type TruthState =
  | "SENT"
  | "ANSWERED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED";

export class TruthEntity {
  constructor(
    public readonly id: string,
    public readonly challengerId: string,
    public readonly receiverId: string,
    public readonly question: string,
    public readonly state: TruthState,
    public readonly createdAt: string,
    public readonly updatedAt: string,
    public readonly answer?: string,
    public readonly votes?: { truth: number; lie: number; total: number },
    public readonly answeredAt?: string,
    public readonly reviewedAt?: string,
  ) {}

  static create(data: {
    id: string;
    challengerId: string;
    receiverId: string;
    question: string;
    state: TruthState;
    createdAt: string;
    updatedAt: string;
    answer?: string;
    votes?: { truth: number; lie: number; total: number };
    answeredAt?: string;
    reviewedAt?: string;
  }): TruthEntity {
    console.log("TruthEntity.create called with:", {
      id: data.id,
      challengerId: data.challengerId,
      receiverId: data.receiverId,
      question: data.question,
      state: data.state,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      createdAtType: typeof data.createdAt,
      updatedAtType: typeof data.updatedAt,
    });

    return new TruthEntity(
      data.id,
      data.challengerId,
      data.receiverId,
      data.question,
      data.state,
      data.createdAt,
      data.updatedAt,
      data.answer,
      data.votes,
      data.answeredAt,
      data.reviewedAt,
    );
  }

  // Business logic methods
  canBeAnswered(): boolean {
    return this.state === "SENT";
  }

  canBeReviewed(): boolean {
    return this.state === "ANSWERED" || this.state === "UNDER_REVIEW";
  }

  isAnswered(): boolean {
    return (
      this.state === "ANSWERED" ||
      this.state === "APPROVED" ||
      this.state === "REJECTED"
    );
  }

  isPublished(): boolean {
    return this.state === "APPROVED";
  }

  submitAnswer(answerText: string): TruthEntity {
    if (!this.canBeAnswered()) {
      throw new Error("Truth cannot be answered in current state");
    }

    return new TruthEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.question,
      "ANSWERED",
      this.createdAt,
      new Date().toISOString(),
      answerText,
      this.votes,
      new Date().toISOString(), // answeredAt
      this.reviewedAt,
    );
  }

  review(isApproved: boolean): TruthEntity {
    if (!this.canBeReviewed()) {
      throw new Error("Truth cannot be reviewed in current state");
    }

    const newState = isApproved ? "APPROVED" : "REJECTED";

    return new TruthEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.question,
      newState,
      this.createdAt,
      new Date().toISOString(),
      this.answer,
      this.votes,
      this.answeredAt,
      new Date().toISOString(), // reviewedAt
    );
  }

  // Alias methods for TruthService compatibility
  canAnswer(): boolean {
    return this.canBeAnswered();
  }

  canVote(): boolean {
    return this.canBeReviewed();
  }

  approve(): TruthEntity {
    return this.review(true);
  }

  reject(): TruthEntity {
    return this.review(false);
  }

  refuse(): TruthEntity {
    if (this.state !== "SENT") {
      throw new Error("Only sent truths can be refused");
    }

    return new TruthEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.question,
      "REJECTED",
      this.createdAt,
      new Date().toISOString(),
      this.answer,
      this.votes,
      this.answeredAt,
      new Date().toISOString(),
    );
  }

  updateVotes(truthVotes: number, lieVotes: number): TruthEntity {
    return new TruthEntity(
      this.id,
      this.challengerId,
      this.receiverId,
      this.question,
      this.state,
      this.createdAt,
      new Date().toISOString(),
      this.answer,
      { truth: truthVotes, lie: lieVotes, total: truthVotes + lieVotes },
      this.answeredAt,
      this.reviewedAt,
    );
  }
}
