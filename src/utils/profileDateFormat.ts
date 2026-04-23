/**
 * Instagram-style date formatting utilities for profile screens
 */

export function formatProfileDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  
  // Invalid date fallback
  if (isNaN(date.getTime())) {
    return "Invalid date";
  }
  
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Future dates - show as "Just now"
  if (diffDays < 0) {
    return "Just now";
  }
  
  // Today
  if (diffDays === 0) {
    return "Today";
  }
  
  // Yesterday
  if (diffDays === 1) {
    return "Yesterday";
  }
  
  // This week
  if (diffDays < 7) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()];
  }
  
  // This year
  if (date.getFullYear() === now.getFullYear()) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }
  
  // Previous years
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatFullDate(timestamp: string): string {
  const date = new Date(timestamp);
  
  // Invalid date fallback
  if (isNaN(date.getTime())) {
    return "Invalid date";
  }
  
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return date.toLocaleDateString('en-US', options);
}

export function formatJoinDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  
  // Invalid date fallback
  if (isNaN(date.getTime())) {
    return "Joined recently";
  }
  
  const months = ["January", "February", "March", "April", "May", "June", 
                  "July", "August", "September", "October", "November", "December"];
  
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  // If current year, just show month
  if (date.getFullYear() === now.getFullYear()) {
    return `Joined ${month}`;
  }
  
  // Otherwise show month and year
  return `Joined ${month} ${year}`;
}

export function getTimeAgoForActivity(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  
  // Invalid date fallback
  if (isNaN(date.getTime())) {
    return "Just now";
  }
  
  const diffMs = now.getTime() - date.getTime();
  
  // Future dates - show as "Just now"
  if (diffMs < 0) {
    return "Just now";
  }
  
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffSeconds < 60) {
    return "Just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffWeeks < 4) {
    return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  } else if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  } else {
    return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
  }
}
