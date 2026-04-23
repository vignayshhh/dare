import {
  uploadOptimizedMedia,
  validateMediaSelection,
} from "@/utils/mediaUpload";

export interface AvatarUploadResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export interface AvatarDeleteResponse {
  success: boolean;
  error?: string;
}

class AvatarService {
  private static instance: AvatarService;

  private constructor() {
    if (AvatarService.instance) {
      return AvatarService.instance;
    }
    AvatarService.instance = this;
  }

  static getInstance(): AvatarService {
    if (!AvatarService.instance) {
      AvatarService.instance = new AvatarService();
    }
    return AvatarService.instance;
  }

  async uploadAvatar(
    userId: string,
    file: File,
  ): Promise<AvatarUploadResponse> {
    try {
      const validation = await validateMediaSelection(file, "avatar", "image");
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      const uploadedAvatar = await uploadOptimizedMedia({
        source: file,
        userId,
        context: "avatar",
        fileName: file.name,
        mediaKind: "image",
      });

      return {
        success: true,
        url: uploadedAvatar.url,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to upload avatar",
      };
    }
  }

  async deleteAvatar(): Promise<AvatarDeleteResponse> {
    try {
      return { success: true };
    } catch (error) {
      console.error("Avatar deletion error:", error);
      return { success: true };
    }
  }

  async updateAvatar(
    userId: string,
    file: File,
    oldAvatarUrl?: string,
  ): Promise<AvatarUploadResponse> {
    try {
      if (oldAvatarUrl && oldAvatarUrl !== "") {
        await this.deleteAvatar();
      }

      return await this.uploadAvatar(userId, file);
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update avatar",
      };
    }
  }

  async validateImageFile(
    file: File,
  ): Promise<{ valid: boolean; error?: string }> {
    const validation = await validateMediaSelection(file, "avatar", "image");

    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error,
      };
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: "Only JPEG, PNG, and WebP images are supported",
      };
    }

    return { valid: true };
  }
}

export const avatarService = AvatarService.getInstance();
