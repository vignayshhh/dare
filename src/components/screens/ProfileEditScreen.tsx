"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  User,
  AtSign,
  Save,
  Check,
  X,
  Camera,
  Upload,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { Avatar } from "../ui/Avatar";
import { useAvatarStore } from "../../stores/avatarStore";
import { usePostsStore } from "../../stores/usePostsStore";
import { avatarSyncService } from "@/services/avatarSyncService";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { profileSyncService } from "@/services/profileSyncService";

interface ProfileEditScreenProps {
  onBack: () => void;
}

export function ProfileEditScreen({ onBack }: ProfileEditScreenProps) {
  const { user, updateProfile, uploadAvatar } = useAuthStore();
  const {
    setGlobalAvatar,
    setCurrentUserId,
    setCurrentUsername,
    clearAvatarStore,
    setUserAvatar,
  } = useAvatarStore();
  const postsStore = usePostsStore();
  const { setCurrentUserProfile } = useProfileDataStore();
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );

  // Debug function to clear cache (automatic only)
  const handleClearCache = () => {
    console.log("🗑️ AUTO CLEARING CACHE (Avatar Updated)");
    clearAvatarStore();
    if ("clearCachedData" in postsStore) {
      (postsStore as any).clearCachedData();
    }
  };
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");

  // Debug user state - Handle user switching and persistence
  useEffect(() => {
    console.log("👤 ProfileEditScreen - User state updated:", {
      userId: user?.id,
      displayName: user?.displayName,
      username: user?.username,
      avatar: user?.avatar ? "has avatar" : "no avatar",
      avatarUrl: user?.avatar,
    });

    // Clear store if user switched (different user logged in)
    const { currentUserId, currentUsername } = useAvatarStore.getState();
    if (currentUserId && user?.id && currentUserId !== user.id) {
      console.log("🔄 USER SWITCHED - Clearing avatar store and cached posts");
      clearAvatarStore();
      // 🗑️ AUTO: Clear cached posts to force refresh with new user's data
      if ("clearCachedData" in postsStore) {
        (postsStore as any).clearCachedData();
      }
    }

    // Set current user info in store
    if (user?.id) {
      setCurrentUserId(user.id);
      console.log("🔥 CURRENT USER ID SET");

      if (user?.username) {
        setCurrentUsername(user.username);
        console.log("🔥 CURRENT USERNAME SET");
      }

      // Priority: Firebase avatar > stored avatar > nothing
      if (user?.avatar) {
        setGlobalAvatar(user.avatar);
        setUserAvatar(user.id, user.avatar);
        console.log("🔥 GLOBAL AVATAR SET FROM FIREBASE");
        console.log("💾 AVATAR STORED FOR USER FROM FIREBASE");
      } else {
        // User has no avatar in Firebase, check if we have one stored
        const { getStoredAvatar } = useAvatarStore.getState();
        const storedAvatar = getStoredAvatar(user.id);
        if (storedAvatar) {
          setGlobalAvatar(storedAvatar);
          console.log("🔥 RESTORED AVATAR FROM LOCAL STORAGE");

          // 🔥 FIREBASE SYNC: Sync stored avatar to Firebase so friends can see it
          setTimeout(async () => {
            console.log("🔥 SYNCING STORED AVATAR TO FIREBASE");
            // Avatar sync handled by avatarSyncService
          }, 500);
        } else {
          console.log("🔥 NO AVATAR FOUND IN FIREBASE OR STORAGE");
        }
      }
    }
  }, [
    user,
    setGlobalAvatar,
    setCurrentUserId,
    setCurrentUsername,
    clearAvatarStore,
  ]);

  // Validation state
  const [displayNameError, setDisplayNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [bioError, setBioError] = useState("");

  // Validate display name
  const validateDisplayName = (name: string): string => {
    if (!name.trim()) return "Display name is required";
    if (name.trim().length < 2)
      return "Display name must be at least 2 characters";
    if (name.trim().length > 50)
      return "Display name must be 50 characters or less";
    return "";
  };

  // Validate username
  const validateUsername = (name: string): string => {
    if (!name.trim()) return "Username is required";
    if (name.trim().length < 3) return "Username must be at least 3 characters";
    if (name.trim().length > 20)
      return "Username must be 20 characters or less";
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return "Username can only contain letters, numbers, and underscores";
    }
    return "";
  };

  // Handle avatar upload
  const handleAvatarUpload = async (file: File) => {
    setIsUploadingAvatar(true);
    try {
      console.log("🖼️ Starting avatar upload for file:", file.name, file.type);
      const response = await uploadAvatar(file);
      console.log("🖼️ Avatar upload response:", response);

      if (response.success && response.user?.avatar) {
        console.log("✅ Avatar uploaded successfully");
        console.log("🖼️ New avatar URL:", response.user.avatar);

        // 🔥 AGGRESSIVE: Set global avatar immediately
        setGlobalAvatar(response.user.avatar);
        console.log("🔥 GLOBAL AVATAR SET IN STORE");

        // 💾 PERSISTENCE: Store avatar for this user specifically
        if (user?.id) {
          setUserAvatar(user.id, response.user.avatar);
          console.log("💾 AVATAR STORED FOR USER:", user.id);
        }

        // 🗑️ AUTO: Clear posts cache to refresh with new avatar
        console.log("🗑️ AUTO CLEARING POSTS CACHE (Avatar Updated)");
        if ("clearCachedData" in postsStore) {
          (postsStore as any).clearCachedData();
        }

        // 🔥 FIREBASE SYNC: Ensure avatar is synced to Firebase so friends can see it
        console.log("🔥 SYNCING AVATAR TO FIREBASE FOR FRIENDS");
        setTimeout(async () => {
          // 🚀 NEW: Force refresh avatar in sync service to trigger real-time updates
          console.log("🚀 TRIGGERING REAL-TIME AVATAR SYNC SERVICE");
          if (user?.id) {
            await avatarSyncService.refreshUserAvatar(user.id);
          }
        }, 1000); // Delay to ensure local storage is updated first
      } else {
        console.error("❌ Avatar upload failed:", response.error);
        // You could show an error message here
      }
    } catch (error) {
      console.error("❌ Avatar upload error:", error);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("📁 FILE INPUT CHANGED!");
    console.log("📁 Event target files:", event.target.files);

    const file = event.target.files?.[0];
    if (file) {
      console.log("📄 FILE SELECTED:");
      console.log("  - Name:", file.name);
      console.log("  - Type:", file.type);
      console.log("  - Size:", file.size);
      console.log("  - Last modified:", file.lastModified);

      console.log("🚀 STARTING AVATAR UPLOAD...");
      handleAvatarUpload(file);
    } else {
      console.log("❌ NO FILE SELECTED");
    }
  };

  // Trigger file input click
  const handleAvatarClick = () => {
    console.log("🖼️ Avatar clicked!");
    console.log("fileInputRef.current:", fileInputRef.current);
    fileInputRef.current?.click();
  };

  // Real-time validation
  useEffect(() => {
    setDisplayNameError(validateDisplayName(displayName));
  }, [displayName]);

  useEffect(() => {
    setUsernameError(validateUsername(username));
  }, [username]);

  const handleSave = async () => {
    // Validate all fields
    const dnError = validateDisplayName(displayName);
    const unError = validateUsername(username);

    if (dnError || unError) {
      setDisplayNameError(dnError);
      setUsernameError(unError);
      return;
    }

    setIsLoading(true);
    setSaveStatus("idle");

    try {
      const updates: { displayName?: string; username?: string; bio?: string } =
        {
          displayName: displayName.trim(),
          bio: bio.trim() || undefined,
        };

      // Include username if it changed
      if (username.trim() && username.trim() !== user?.username) {
        updates.username = username.trim().toLowerCase();
      }

      const response = await updateProfile(updates);

      if (response.success) {
        setSaveStatus("success");

        // 🔥 Update profile data store so changes propagate everywhere
        if (user?.id) {
          const finalDisplayName = displayName.trim();
          const finalUsername = updates.username || user.username;
          setCurrentUserProfile(user.id, finalDisplayName, finalUsername);
          console.log("🔥 PROFILE DATA STORE UPDATED:", {
            finalDisplayName,
            finalUsername,
          });

          // 🗑️ Clear posts cache so feed refreshes with new name
          console.log("🗑️ AUTO CLEARING POSTS CACHE (Profile Updated)");
          if ("clearCachedData" in postsStore) {
            (postsStore as any).clearCachedData();
          }

          // 🚀 Trigger real-time profile sync so friends see the change
          console.log("🚀 TRIGGERING REAL-TIME PROFILE SYNC");
          await profileSyncService.refreshUserProfile(user.id);
        }

        // Wait a moment to show success feedback
        setTimeout(() => {
          onBack();
        }, 1000);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Failed to update profile:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid =
    !displayNameError &&
    !usernameError &&
    displayName.trim() &&
    username.trim();

  return (
    <div className="app-viewport bg-[#0a0f0a]">
      {/* Header */}
      <div className="bg-black border-b border-gray-800">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="text-[#94a3b8] hover:text-white transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={20} />
              <span>Back</span>
            </button>

            <h1 className="text-xl font-bold text-white">Edit Profile</h1>

            <button
              onClick={handleSave}
              disabled={!isFormValid || isLoading}
              className="bg-[#4ade80] hover:bg-[#22c55e] disabled:bg-[#2a2a2a] disabled:text-[#64748b] text-black font-semibold px-4 py-2 rounded-full flex items-center gap-2 transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pb-[calc(var(--safe-area-bottom)+6rem)]">
        <div className="max-w-md mx-auto w-full space-y-6">
          {/* Save Status Feedback */}
          {saveStatus === "success" && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-4 flex items-center gap-3">
              <Check size={20} className="text-green-500" />
              <div>
                <p className="text-white font-semibold">Profile Updated!</p>
                <p className="text-[#94a3b8] text-sm">
                  Your changes have been saved successfully.
                </p>
              </div>
            </div>
          )}

          {saveStatus === "error" && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 flex items-center gap-3">
              <X size={20} className="text-red-500" />
              <div>
                <p className="text-white font-semibold">Update Failed</p>
                <p className="text-[#94a3b8] text-sm">
                  Please try again later.
                </p>
              </div>
            </div>
          )}

          {/* Display Name */}
          <div className="space-y-3">
            <label className="text-white font-medium flex items-center gap-2">
              <User size={18} className="text-[#4ade80]" />
              <span>Display Name</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                className={`w-full bg-[#1a1a1a] border ${
                  displayNameError
                    ? "border-red-500 focus:border-red-500"
                    : "border-[#2a2a2a] focus:border-[#4ade80]"
                } text-white rounded-xl px-4 py-3 outline-none transition-colors`}
                maxLength={50}
              />
              {displayNameError && (
                <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                  <X size={14} />
                  {displayNameError}
                </p>
              )}
            </div>
            <p className="text-[#64748b] text-xs">
              This is how you&apos;ll appear on DARE. Must be 2-50 characters.
            </p>
          </div>

          {/* Username */}
          <div className="space-y-3">
            <label className="text-white font-medium flex items-center gap-2">
              <AtSign size={18} className="text-[#4ade80]" />
              <span>Username</span>
            </label>
            <div className="relative">
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#64748b] pointer-events-none">
                  @
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    const value = e.target.value
                      .toLowerCase()
                      .replace(/[^a-zA-Z0-9_]/g, "");
                    setUsername(value);
                  }}
                  placeholder="username"
                  className={`w-full bg-[#1a1a1a] border ${
                    usernameError
                      ? "border-red-500 focus:border-red-500"
                      : "border-[#2a2a2a] focus:border-[#4ade80]"
                  } text-white rounded-xl pl-10 pr-4 py-3 outline-none transition-colors`}
                  maxLength={20}
                />
              </div>
              {usernameError && (
                <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                  <X size={14} />
                  {usernameError}
                </p>
              )}
            </div>
            <p className="text-[#64748b] text-xs">
              Your unique handle. Letters, numbers, and underscores only. 3-20
              characters.
            </p>
          </div>

          {/* Preview */}
          <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#2a2a2a]">
            <p className="text-[#94a3b8] text-sm font-medium mb-3">Preview</p>
            <div className="flex items-center gap-3">
              <div
                className="relative cursor-pointer"
                onClick={handleAvatarClick}
              >
                <Avatar
                  src={user?.avatar || ""}
                  alt={displayName || "Your Name"}
                  size="lg"
                  clickable={false}
                  className="ring-2 ring-[#4ade80]/20"
                  userId={user?.id}
                />
                {isUploadingAvatar && (
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {/* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointer-events-none blocking touch */}
                <div className="absolute bottom-0 right-0 bg-[#4ade80] rounded-full p-1.5 border-2 border-black">
                  <Camera size={12} className="text-black" />
                </div>
              </div>
              <div>
                <p className="text-white font-medium">
                  {displayName || "Your Name"}
                </p>
                <p className="text-[#94a3b8] text-sm">
                  @{username || "username"}
                </p>
              </div>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Avatar upload hint */}
            <p className="text-[#64748b] text-xs mt-3 flex items-center gap-1">
              <Camera size={12} />
              Tap avatar to change photo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
