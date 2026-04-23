/**
 * Utility functions for handling avatar URLs safely
 */

export function getSafeAvatarSrc(avatarUrl?: string | null): string | null {
  // Return null if avatarUrl is empty, undefined, null, or just whitespace
  if (!avatarUrl || avatarUrl.trim() === "") {
    return null;
  }

  // Return the avatar URL if it's valid
  return avatarUrl;
}

export function getAvatarFallback(name?: string): string {
  // Generate a simple fallback based on the name
  if (!name || name.trim() === "") {
    return "?"; // Default fallback for empty names
  }

  // Get first letter of first name, capitalized
  const firstName = name.split(" ")[0];
  return firstName.charAt(0).toUpperCase();
}

export function getAvatarStyle(avatarUrl?: string | null): {
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  display?: string;
  alignItems?: string;
  justifyContent?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
} {
  const safeSrc = getSafeAvatarSrc(avatarUrl);

  if (safeSrc) {
    return {
      backgroundImage: `url(${safeSrc})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }

  // Return fallback style for empty avatar
  return {
    backgroundColor: "#4ade80",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#000",
    fontSize: "18px",
    fontWeight: "700",
  };
}
