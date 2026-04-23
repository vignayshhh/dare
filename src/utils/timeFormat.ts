export function formatTimeAgo(timestamp: string): string {
  const now = new Date();

  // Handle different timestamp formats
  let postDate: Date;
  try {
    postDate = new Date(timestamp);
  } catch (error) {
    console.warn("Invalid timestamp format:", timestamp);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = now.getDate();
    const month = months[now.getMonth()];
    return `${day} ${month}`;
  }

  // Validate that the post date is valid
  if (isNaN(postDate.getTime())) {
    console.warn("Invalid date created from timestamp:", timestamp);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = now.getDate();
    const month = months[now.getMonth()];
    return `${day} ${month}`;
  }

  const diffMs = now.getTime() - postDate.getTime();

  // If the difference is negative (post is in the future), use current date
  if (diffMs < 0) {
    console.warn("Future timestamp detected:", timestamp);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = now.getDate();
    const month = months[now.getMonth()];
    return `${day} ${month}`;
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Always show date format like Instagram
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = postDate.getDate();
  const month = months[postDate.getMonth()];
  return `${day} ${month}`;
}
