export class AuthUserEntity {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly username: string,
    public readonly nickname: string,
    public readonly displayName: string,
    public readonly is18Plus: boolean,
    public readonly consentAccepted: boolean,
    public readonly visibility: "PUBLIC" | "PRIVATE",
    public readonly daresCompleted: number,
    public readonly daresRefused: number,
    public readonly ghostModeActive: boolean,
    public readonly ghostModeExpiresAt: string | null,
    public readonly createdAt: string,
    public readonly updatedAt: string,
  ) {}

  static create(userData: {
    userId: string;
    email: string;
    username: string;
    nickname: string;
    displayName: string;
    is18Plus: boolean;
    consentAccepted: boolean;
    visibility: "PUBLIC" | "PRIVATE";
    daresCompleted: number;
    daresRefused: number;
    ghostModeActive: boolean;
    ghostModeExpiresAt: string | null;
    createdAt: string;
    updatedAt: string;
  }): AuthUserEntity {
    return new AuthUserEntity(
      userData.userId,
      userData.email,
      userData.username,
      userData.nickname,
      userData.displayName,
      userData.is18Plus,
      userData.consentAccepted,
      userData.visibility,
      userData.daresCompleted,
      userData.daresRefused,
      userData.ghostModeActive,
      userData.ghostModeExpiresAt,
      userData.createdAt,
      userData.updatedAt,
    );
  }

  isGhostModeActive(): boolean {
    if (!this.ghostModeActive || !this.ghostModeExpiresAt) {
      return false;
    }
    return new Date(this.ghostModeExpiresAt) > new Date();
  }

  canBeDared(): boolean {
    return this.is18Plus && this.consentAccepted && !this.isGhostModeActive();
  }

  updateProfile(updates: {
    displayName?: string;
    nickname?: string;
    visibility?: "PUBLIC" | "PRIVATE";
    ghostModeActive?: boolean;
  }): AuthUserEntity {
    return new AuthUserEntity(
      this.userId,
      this.email,
      this.username,
      updates.nickname ?? this.nickname,
      updates.displayName ?? this.displayName,
      this.is18Plus,
      this.consentAccepted,
      updates.visibility ?? this.visibility,
      this.daresCompleted,
      this.daresRefused,
      updates.ghostModeActive ?? this.ghostModeActive,
      this.ghostModeExpiresAt,
      this.createdAt,
      new Date().toISOString(),
    );
  }
}
