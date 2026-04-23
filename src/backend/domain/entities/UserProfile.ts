export class UserProfileEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly username: string,
    public readonly nickname: string,
    public readonly displayName: string | null,
    public readonly bio: string | null,
    public readonly avatarUrl: string | null,
    public readonly visibility: "PUBLIC" | "PRIVATE",
    public readonly is18Plus: boolean,
    public readonly consentAccepted: boolean,
    public readonly daresCompleted: number,
    public readonly daresRefused: number,
    public readonly ghostModeActive: boolean,
    public readonly ghostModeExpiresAt: string | null,
    public readonly createdAt: string,
    public readonly updatedAt: string,
  ) {}

  static create(data: {
    id: string;
    userId: string;
    username: string;
    nickname: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    visibility: "PUBLIC" | "PRIVATE";
    is18Plus: boolean;
    consentAccepted: boolean;
    daresCompleted: number;
    daresRefused: number;
    ghostModeActive: boolean;
    ghostModeExpiresAt: string | null;
    createdAt: string;
    updatedAt: string;
  }): UserProfileEntity {
    return new UserProfileEntity(
      data.id,
      data.userId,
      data.username,
      data.nickname,
      data.displayName,
      data.bio,
      data.avatarUrl,
      data.visibility,
      data.is18Plus,
      data.consentAccepted,
      data.daresCompleted,
      data.daresRefused,
      data.ghostModeActive,
      data.ghostModeExpiresAt,
      data.createdAt,
      data.updatedAt,
    );
  }

  isPublic(): boolean {
    return this.visibility === "PUBLIC";
  }

  isPrivate(): boolean {
    return this.visibility === "PRIVATE";
  }

  isGhostModeActive(): boolean {
    if (!this.ghostModeActive || !this.ghostModeExpiresAt) {
      return false;
    }
    return new Date(this.ghostModeExpiresAt) > new Date();
  }

  canBeViewedBy(viewerId?: string): boolean {
    if (this.isPublic()) {
      return true;
    }

    if (this.isPrivate()) {
      return viewerId === this.userId;
    }

    return false;
  }

  canReceiveDares(): boolean {
    return this.is18Plus && this.consentAccepted && !this.isGhostModeActive();
  }

  updateProfile(updates: {
    nickname?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    visibility?: "PUBLIC" | "PRIVATE";
    ghostModeActive?: boolean;
    ghostModeExpiresAt?: string | null;
  }): UserProfileEntity {
    return new UserProfileEntity(
      this.id,
      this.userId,
      this.username,
      updates.nickname ?? this.nickname,
      updates.displayName ?? this.displayName,
      updates.bio ?? this.bio,
      updates.avatarUrl ?? this.avatarUrl,
      updates.visibility ?? this.visibility,
      this.is18Plus,
      this.consentAccepted,
      this.daresCompleted,
      this.daresRefused,
      updates.ghostModeActive ?? this.ghostModeActive,
      updates.ghostModeExpiresAt ?? this.ghostModeExpiresAt,
      this.createdAt,
      new Date().toISOString(),
    );
  }

  incrementDaresCompleted(): UserProfileEntity {
    return new UserProfileEntity(
      this.id,
      this.userId,
      this.username,
      this.nickname,
      this.displayName,
      this.bio,
      this.avatarUrl,
      this.visibility,
      this.is18Plus,
      this.consentAccepted,
      this.daresCompleted + 1,
      this.daresRefused,
      this.ghostModeActive,
      this.ghostModeExpiresAt,
      this.createdAt,
      new Date().toISOString(),
    );
  }

  incrementDaresRefused(): UserProfileEntity {
    return new UserProfileEntity(
      this.id,
      this.userId,
      this.username,
      this.nickname,
      this.displayName,
      this.bio,
      this.avatarUrl,
      this.visibility,
      this.is18Plus,
      this.consentAccepted,
      this.daresCompleted,
      this.daresRefused + 1,
      this.ghostModeActive,
      this.ghostModeExpiresAt,
      this.createdAt,
      new Date().toISOString(),
    );
  }
}
