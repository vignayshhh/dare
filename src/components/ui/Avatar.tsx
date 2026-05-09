import React, { useState, useEffect } from "react";
import { Ghost } from "lucide-react";
import { useAvatarStore, getAggressiveAvatar } from "../../stores/avatarStore";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useUserGhostMode } from "../../hooks/useUserGhostMode";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useGhostModeStore } from "../../stores/useGhostModeStore";

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | number;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: string;
  onClick?: () => void;
  clickable?: boolean;
  showStatus?: boolean;
  status?: "online" | "offline" | "story";
  borderColor?: string;
  userId?: string;
  username?: string;
  forceGhostMode?: boolean;
  disableGhostMode?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size,
  username,
  userId,
  forceGhostMode,
  disableGhostMode = false,
  className = "",
  style,
  onClick,
  showStatus = false,
  status = "offline",
  fallbackText,
  clickable = false,
}) => {
  const AVATAR_SCALE = 0.94;
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const currentUserGhostModeActive = useGhostModeStore((state) => state.isActive);

  // Use real-time avatar subscription for other users when userId is provided
  // This ensures avatars update in real-time when other users change their profile picture
  const { avatar: realTimeAvatar } = useUserAvatar(userId);
  const { isGhostModeActive: userGhostModeActive } = useUserGhostMode(userId);

  // Subscribe to avatar store so this component re-renders when avatars update.
  // Without this, using getState() alone can leave stale avatars on screen.
  useAvatarStore((state) => state.globalAvatar);
  useAvatarStore((state) => state.currentUserId);
  useAvatarStore((state) => state.currentUsername);
  useAvatarStore((state) => (userId ? state.userAvatars[userId] : ""));

  // Get aggressive avatar from store - prioritize real-time avatar for other users
  const finalSrc = getAggressiveAvatar(
    realTimeAvatar || src,
    "",
    userId,
    username,
  );
  const isCurrentUserAvatar = Boolean(userId && currentUserId === userId);
  const showGhostAvatar =
    disableGhostMode
      ? false
      : forceGhostMode ??
        (isCurrentUserAvatar
          ? currentUserGhostModeActive || userGhostModeActive
          : userGhostModeActive);

  const handleError = () => {
    setImageError(true);
  };

  const handleLoad = () => {
    setImageLoaded(true);
  };

  // Size classes mapping
  const sizeClasses = {
    xs: "w-[22px] h-[22px] text-xs",
    sm: "w-[30px] h-[30px] text-xs",
    md: "w-[45px] h-[45px] text-sm",
    lg: "w-[60px] h-[60px] text-base",
    xl: "w-[75px] h-[75px] text-lg",
    "2xl": "w-[90px] h-[90px] text-xl",
  };

  const resolvedSize = size || "md";
  const presetSize =
    typeof resolvedSize === "number" ? null : resolvedSize;
  const numericSize = typeof resolvedSize === "number" ? resolvedSize : null;
  const scaledNumericSize =
    numericSize !== null ? Math.round(numericSize * AVATAR_SCALE) : null;
  const resolvedSizeClasses = presetSize ? sizeClasses[presetSize] : "";
  const textSize =
    scaledNumericSize !== null
      ? Math.max(12, Math.round(scaledNumericSize * 0.35))
      : undefined;

  // Generate fallback text from alt or provided text
  const getFallbackText = () => {
    if (fallbackText) return fallbackText.charAt(0).toUpperCase();
    if (alt && alt !== "User Avatar") return alt.charAt(0).toUpperCase();
    return "U";
  };

  // Handle image load error
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageError(true);
    setIsLoading(false);
  };

  // Handle image load success
  const handleImageLoad = () => {
    setImageError(false);
    setIsLoading(false);
  };

  const baseClasses = `
    ${resolvedSizeClasses}
    rounded-full
    flex items-center justify-center
    font-semibold
    transition-all duration-200
    ${clickable ? "cursor-pointer" : ""}
    ${className}
  `;

  // Always relative so the absolute fallback + status indicator work
  const containerClasses = `${baseClasses} relative overflow-hidden`;

  // Status indicator styles
  const getStatusStyles = () => {
    if (!showStatus) return null;

    const statusSizeMap = {
      xs: "w-2 h-2",
      sm: "w-2.5 h-2.5",
      md: "w-3 h-3",
      lg: "w-3.5 h-3.5",
      xl: "w-4 h-4",
      "2xl": "w-5 h-5",
    };

    const statusColors = {
      online: "bg-green-500",
      offline: "bg-gray-400",
      story: "bg-gradient-to-tr from-yellow-400 to-pink-500",
    };

    return (
      <div
        className={`
          absolute bottom-0 right-0
          ${statusSizeMap[presetSize || "md"]}
          ${statusColors[status]}
          rounded-full
          border-2
          ${presetSize === "xs" || presetSize === "sm" ? "border-gray-900" : "border-black"}
        `}
      />
    );
  };

  // NORMAL RENDERING: Use proper logic with fallback
  // Always show fallback when there's no src, on error, OR while loading
  const showFallback = !finalSrc || imageError || isLoading || showGhostAvatar;
  const ghostIconSize =
    scaledNumericSize !== null
      ? Math.max(18, Math.round(scaledNumericSize * 0.54))
      : presetSize === "xs"
        ? 14
        : presetSize === "sm"
          ? 17
          : presetSize === "md"
            ? 22
            : presetSize === "lg"
              ? 28
              : presetSize === "xl"
                ? 34
                : 40;

  return (
    <div
      className={containerClasses}
      onClick={onClick}
      style={{
        width: scaledNumericSize ?? undefined,
        height: scaledNumericSize ?? undefined,
        fontSize: textSize,
        ...style,
      }}
    >
      {/* Fallback: visible when no src, error, or still loading */}
      {showFallback && (
        <div
          className={`${
            resolvedSizeClasses
          } rounded-full flex items-center justify-center font-semibold absolute inset-0 ${
            showGhostAvatar
              ? "bg-[radial-gradient(circle_at_30%_30%,#dcfce7_0%,#86efac_18%,#22c55e_48%,#0b5d34_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.48),0_10px_24px_rgba(34,197,94,0.35)]"
              : "bg-[#4ade80] text-black"
          }`}
        >
          {showGhostAvatar ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <div className="absolute inset-[12%] rounded-full border border-white/20 bg-[radial-gradient(circle_at_top,#ffffff33_0%,transparent_60%)]" />
              <div className="absolute inset-[18%] rounded-full ring-1 ring-white/10" />
              <Ghost
                size={ghostIconSize}
                strokeWidth={2.3}
                className="relative drop-shadow-[0_3px_10px_rgba(6,78,59,0.45)]"
              />
            </div>
          ) : (
            <span className="select-none">{getFallbackText()}</span>
          )}
        </div>
      )}
      {/* Image: render when we have a src and no error; hidden until loaded */}
      {finalSrc && !imageError && !showGhostAvatar && (
        <img
          src={finalSrc}
          alt={alt}
          className="absolute inset-0 w-full h-full rounded-full object-cover"
          onError={handleImageError}
          onLoad={handleImageLoad}
          style={{
            display: isLoading ? "none" : "block",
            objectFit: "cover",
          }}
        />
      )}
      {getStatusStyles()}
    </div>
  );
};
