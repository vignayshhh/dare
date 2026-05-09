"use client";

import { useState, useRef } from "react";
import {
  Camera,
  User,
  FileText,
  Shield,
  ChevronRight,
  Check,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";

interface ProfileData {
  bio: string;
  avatar: File | null;
  is18Plus: boolean;
  privacyMode: "public" | "friends" | "private";
  notifications: {
    challenges: boolean;
    messages: boolean;
    friendRequests: boolean;
  };
}

export function ProfileCreationScreen({
  onComplete,
  onBack,
}: {
  onComplete: (profileData: ProfileData) => void;
  onBack: () => void;
}) {
  const { user, updateProfile, uploadAvatar, completeProfileCreation } =
    useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileData, setProfileData] = useState<ProfileData>({
    bio: "",
    avatar: null,
    is18Plus: user?.is_18_plus ?? true,
    privacyMode: "public",
    notifications: {
      challenges: true,
      messages: true,
      friendRequests: true,
    },
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const totalSteps = 3;

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setAvatarPreview(result);
        setProfileData((prev) => ({ ...prev, avatar: file }));
      };
      reader.readAsDataURL(file);
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      return profileData.bio.length <= 200;
    }

    if (step === 2) {
      return profileData.is18Plus;
    }

    return true;
  };

  const handleNext = async () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    } else {
      await handleComplete();
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      if (profileData.avatar) {
        const avatarResult = await uploadAvatar(profileData.avatar);
        if (!avatarResult.success) {
          throw new Error(avatarResult.error || "Failed to upload avatar");
        }
      }

      const updates: {
        bio: string;
        visibility: "PUBLIC" | "PRIVATE";
        is_18_plus: boolean;
        notificationPreferences: ProfileData["notifications"];
      } = {
        bio: profileData.bio,
        visibility:
          profileData.privacyMode === "public" ? "PUBLIC" : "PRIVATE",
        is_18_plus: profileData.is18Plus,
        notificationPreferences: profileData.notifications,
      };

      const result = await updateProfile(updates);

      if (result.success) {
        await completeProfileCreation();
        onComplete(profileData);
      } else {
        alert(result.error || "Failed to update profile");
      }
    } catch (error) {
      console.error("Profile creation error:", error);
      alert("Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-[#4ade80] rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera size={40} className="text-black" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Add a profile photo
              </h2>
              <p className="text-[#94a3b8] text-sm">
                Show your friends who you are (optional)
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-32 h-32 bg-[#1a1a1a] rounded-full flex items-center justify-center overflow-hidden border-4 border-[#2a2a2a]">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Avatar preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={48} className="text-[#4a5568]" />
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-10 h-10 bg-[#4ade80] rounded-full flex items-center justify-center border-2 border-[#0a0f0a]"
                  >
                    <Camera size={18} className="text-black" />
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              <div className="space-y-4">
                <div className="auth-input-wrap">
                  <FileText
                    size={18}
                    className="text-[#64748b] mr-3 shrink-0"
                  />
                  <textarea
                    placeholder="Tell us about yourself... (optional)"
                    value={profileData.bio}
                    onChange={(e) =>
                      setProfileData((prev) => ({
                        ...prev,
                        bio: e.target.value,
                      }))
                    }
                    className="auth-input min-h-[100px] resize-none"
                    maxLength={200}
                  />
                </div>

                {profileData.bio && (
                  <p className="text-[#94a3b8] text-xs text-right">
                    {profileData.bio.length}/200 characters
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-[#4ade80] rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={40} className="text-black" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Privacy & Safety
              </h2>
              <p className="text-[#94a3b8] text-sm">
                Configure your preferences
              </p>
            </div>

            <div className="space-y-6">
              {/* Age Confirmation */}
              <div className="bg-[#1a1a1a] rounded-2xl p-4 border border-[#4ade80] {profileData.is18Plus ? '' : 'border-2 border-red-500'}">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profileData.is18Plus}
                    onChange={(e) => {
                      setProfileData((prev) => ({
                        ...prev,
                        is18Plus: e.target.checked,
                      }));
                    }}
                    className="mt-1 w-5 h-5 rounded border-[#4a5568] bg-[#2a2a2a] text-[#4ade80] focus:ring-[#4ade80] focus:ring-offset-0"
                  />
                  <div>
                    <p className="text-white font-medium">
                      I am 18 years or older{" "}
                      {profileData.is18Plus ? "✅" : "❌"}
                    </p>
                    <p className="text-[#94a3b8] text-sm mt-1">
                      Required to access adult content and participate in
                      challenges
                    </p>
                    {!profileData.is18Plus && (
                      <p className="text-red-400 text-xs mt-2">
                        ⚠️ You must check this box to continue
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* Privacy Mode */}
              <div className="space-y-3">
                <p className="text-white font-medium">Profile Visibility</p>
                <div className="space-y-2">
                  {[
                    {
                      value: "public",
                      label: "Public",
                      desc: "Anyone can find and interact with you",
                    },
                    {
                      value: "friends",
                      label: "Friends Only",
                      desc: "Only friends can see your activity",
                    },
                    {
                      value: "private",
                      label: "Private",
                      desc: "Maximum privacy, limited interactions",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]"
                    >
                      <input
                        type="radio"
                        name="privacy"
                        value={option.value}
                        checked={profileData.privacyMode === option.value}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            privacyMode: e.target.value as any,
                          }))
                        }
                        className="w-4 h-4 text-[#4ade80] bg-[#2a2a2a] border-[#4a5568] focus:ring-[#4ade80]"
                      />
                      <div>
                        <p className="text-white font-medium">{option.label}</p>
                        <p className="text-[#94a3b8] text-sm">{option.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notification Preferences */}
              <div className="space-y-3">
                <p className="text-white font-medium">Notifications</p>
                <div className="space-y-2">
                  {[
                    {
                      key: "challenges",
                      label: "Challenge Invites",
                      desc: "When someone sends you a dare",
                    },
                    {
                      key: "messages",
                      label: "Messages",
                      desc: "When you receive new messages",
                    },
                    {
                      key: "friendRequests",
                      label: "Friend Requests",
                      desc: "When someone wants to connect",
                    },
                  ].map((notification) => (
                    <label
                      key={notification.key}
                      className="flex items-center justify-between cursor-pointer p-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]"
                    >
                      <div>
                        <p className="text-white font-medium">
                          {notification.label}
                        </p>
                        <p className="text-[#94a3b8] text-sm">
                          {notification.desc}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={
                          profileData.notifications[
                            notification.key as keyof typeof profileData.notifications
                          ]
                        }
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            notifications: {
                              ...prev.notifications,
                              [notification.key]: e.target.checked,
                            },
                          }))
                        }
                        className="w-5 h-5 rounded border-[#4a5568] bg-[#2a2a2a] text-[#4ade80] focus:ring-[#4ade80] focus:ring-offset-0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-[#4ade80] rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={40} className="text-black" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">All set!</h2>
              <p className="text-[#94a3b8] text-sm">
                Your profile is ready to go
              </p>
            </div>

            <div className="space-y-6">
              {/* Profile Summary */}
              <div className="bg-[#1a1a1a] rounded-2xl p-6 border border-[#2a2a2a]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-[#2a2a2a] rounded-full flex items-center justify-center overflow-hidden">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Avatar preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={32} className="text-[#4a5568]" />
                    )}
                  </div>
                  <div>
                    <p className="text-white font-medium text-lg">
                      {user?.displayName || "Welcome!"}
                    </p>
                    <p className="text-[#94a3b8] text-sm">
                      @{user?.username || "username"}
                    </p>
                  </div>
                </div>

                {profileData.bio && (
                  <div className="mb-4">
                    <p className="text-[#94a3b8] text-sm">Bio:</p>
                    <p className="text-white">{profileData.bio}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-[#4ade80]" />
                    <span className="text-white text-sm">
                      Privacy: {profileData.privacyMode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check size={16} className="text-[#4ade80]" />
                    <span className="text-white text-sm">
                      Age verified: {profileData.is18Plus ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-[#94a3b8] text-sm">
                  You&apos;re all ready to start daring!
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col px-4 py-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="text-[#94a3b8] hover:text-white transition-colors"
        >
          ← Back
        </button>
        {/* Progress Indicator */}
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i + 1 <= currentStep ? "bg-[#4ade80] w-8" : "bg-[#2a2a2a] w-2"
              }`}
            />
          ))}
        </div>
        <div className="w-12" /> {/* Spacer for centering */}
      </div>

      {/* User Info Header */}
      {user && (
        <div className="text-center mb-6">
          <p className="text-[#94a3b8] text-sm mb-2">Welcome aboard!</p>
          <div className="bg-[#1a1a1a] rounded-full px-4 py-2 inline-flex items-center gap-3">
            <div className="w-8 h-8 bg-[#2a2a2a] rounded-full flex items-center justify-center">
              <User size={16} className="text-[#94a3b8]" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium text-sm">
                {user.displayName}
              </p>
              <p className="text-[#94a3b8] text-xs">@{user.username}</p>
            </div>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="animate-slide-up">{renderStepContent()}</div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 max-w-md mx-auto w-full space-y-4">
        {currentStep > 1 && (
          <button
            onClick={() => setCurrentStep((prev) => prev - 1)}
            className="w-full bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-medium py-3.5 rounded-full transition-colors"
          >
            Previous
          </button>
        )}

        <button
          onClick={handleNext}
          disabled={!validateStep(currentStep) || isLoading}
          className="w-full bg-[#4ade80] hover:bg-[#22c55e] disabled:bg-[#2a2a2a] disabled:text-[#64748b] text-black font-bold py-3.5 rounded-full transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            "Saving..."
          ) : currentStep === totalSteps ? (
            <>
              Complete Profile
              <ChevronRight size={18} />
            </>
          ) : (
            <>
              Next
              <ChevronRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
