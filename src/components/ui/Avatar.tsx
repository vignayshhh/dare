import React, { useState, useEffect } from "react";
import { useAvatarStore, getAggressiveAvatar } from "../../stores/avatarStore";

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  fallbackText?: string;
  onClick?: () => void;
  clickable?: boolean;
  showStatus?: boolean;
  status?: "online" | "offline" | "story";
  borderColor?: string;
  userId?: string;
  username?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size,
  username,
  userId,
  className = "",
  onClick,
  showStatus = false,
  status = "offline",
  fallbackText,
  clickable = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe to avatar store so this component re-renders when avatars update.
  // Without this, using getState() alone can leave stale avatars on screen.
  useAvatarStore((state) => state.globalAvatar);
  useAvatarStore((state) => state.currentUserId);
  useAvatarStore((state) => state.currentUsername);
  useAvatarStore((state) => (userId ? state.userAvatars[userId] : ""));

  // Get aggressive avatar from store
  const finalSrc = getAggressiveAvatar(src, "", userId, username);

  const handleError = () => {
    setImageError(true);
  };

  const handleLoad = () => {
    setImageLoaded(true);
  };

  // Size classes mapping
  const sizeClasses = {
    xs: "w-6 h-6 text-xs",
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-16 h-16 text-base",
    xl: "w-20 h-20 text-lg",
    "2xl": "w-24 h-24 text-xl",
  };

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
    ${sizeClasses[size || "md"]}
    rounded-full
    flex items-center justify-center
    font-semibold
    transition-all duration-200
    ${clickable ? "cursor-pointer" : ""}
    ${className}
  `;

  // Always relative so the absolute fallback + status indicator work
  const containerClasses = `${baseClasses} relative`;

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
          ${statusSizeMap[size || "md"]}
          ${statusColors[status]}
          rounded-full
          border-2
          ${size === "xs" || size === "sm" ? "border-gray-900" : "border-black"}
        `}
      />
    );
  };

  // NORMAL RENDERING: Use proper logic with fallback
  // Always show fallback when there's no src, on error, OR while loading
  const showFallback = !finalSrc || imageError || isLoading;

  return (
    <div className={containerClasses} onClick={onClick}>
      {/* Fallback: visible when no src, error, or still loading */}
      {showFallback && (
        <div
          className={`${sizeClasses[size || "md"]} bg-[#4ade80] text-black rounded-full flex items-center justify-center font-semibold absolute inset-0`}
        >
          <span className="select-none">{getFallbackText()}</span>
        </div>
      )}
      {/* Image: render when we have a src and no error; hidden until loaded */}
      {finalSrc && !imageError && (
        <img
          src={finalSrc}
          alt={alt}
          className="w-full h-full rounded-full object-cover"
          onError={handleImageError}
          onLoad={handleImageLoad}
          style={{
            display: isLoading ? "none" : "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      {getStatusStyles()}
    </div>
  );
};
