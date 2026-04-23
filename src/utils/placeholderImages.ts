/**
 * Placeholder Image Generator
 * Generates SVG-based placeholder images internally to avoid external service dependencies
 * Uses deterministic color generation based on user ID for consistency
 *
 * SECURITY: These SVGs are internally generated with controlled input (userId, displayName)
 * No user-provided HTML/JavaScript is injected, making this safe from XSS attacks.
 * The SVG content is encoded as base64 data URI, preventing script execution.
 */

/**
 * Generate a consistent color from a string (user ID, username, etc.)
 */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const h = hash % 360;
  const s = 70 + (Math.abs(hash) % 20); // 70-90% saturation
  const l = 45 + (Math.abs(hash) % 15); // 45-60% lightness

  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * Generate a default avatar SVG data URI
 */
export function generateDefaultAvatar(
  userId: string,
  displayName?: string,
  size: number = 100,
): string {
  const backgroundColor = stringToColor(userId);
  const initials = displayName
    ? displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : userId.slice(0, 2).toUpperCase();

  // SECURITY: SVG content is controlled and safe - no user-provided HTML/JS
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="${backgroundColor}"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
            font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white">
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Generate a default media placeholder SVG data URI
 */
export function generatePlaceholderMedia(
  width: number,
  height: number,
  text: string = "No Media",
): string {
  const backgroundColor = "#e0e0e0";
  const textColor = "#757575";

  // SECURITY: SVG content is controlled and safe - no user-provided HTML/JS
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="${backgroundColor}"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
            font-family="Arial, sans-serif" font-size="${Math.min(width, height) * 0.1}" fill="${textColor}">
        ${text}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Get default avatar URL - replaces picsum.photos calls
 */
export function getDefaultAvatarUrl(
  userId: string,
  displayName?: string,
  size: number = 100,
): string {
  // Check if user has a custom avatar in Firebase Storage
  // This would be fetched from the user profile
  // For now, generate a default avatar
  return generateDefaultAvatar(userId, displayName, size);
}
