export type CommunityJoinPreviewUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
};

export type CommunityChallenge = {
  id: string;
  typeLabel: string;
  countdown: string;
  batchStatus?: "open" | "waiting" | "started";
  minRequiredMembers?: number;
  registrationEndsAtMs?: number | null;
  batchStartedAtMs?: number | null;
  titleTop: string;
  titleAccent: string;
  joinedCount: number;
  friendNames: string[];
  joinPreview?: CommunityJoinPreviewUser[];
  extraFriends: number;
  survivors: number;
  eliminated: number;
  accent: string;
  secondaryAccent: string;
  imageUrl: string;
  imagePosition?: string;
  banner: string;
  description: string;
  startedAt: string;
  durationLabel: string;
  creatorName: string;
  creatorUsername: string;
  creatorAvatar?: string;
  sponsoredByDare?: boolean;
  proofLabel: string;
  proofFiles: string[];
  icon: "flame" | "shield" | "trophy";
};

export const COMMUNITY_CHALLENGES: CommunityChallenge[] = [
  {
    id: "community-read-10-pages",
    typeLabel: "Created by Dare",
    countdown: "06:18:42",
    titleTop: "Read 10 pages every day",
    titleAccent: "for 7 days",
    joinedCount: 0,
    friendNames: [],
    extraFriends: 0,
    survivors: 0,
    eliminated: 0,
    accent: "#4ade80",
    secondaryAccent: "#38bdf8",
    imageUrl:
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center",
    banner:
      "radial-gradient(circle at 18% 18%, rgba(74,222,128,0.34), transparent 24%), radial-gradient(circle at 82% 22%, rgba(14,165,233,0.22), transparent 25%), repeating-linear-gradient(92deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 16px), linear-gradient(145deg, rgba(15,23,19,0.98), rgba(4,8,5,1) 54%, rgba(30,64,48,0.95))",
    description:
      "Build a quiet reading streak by reading at least 10 pages every day. Upload a clear proof photo of the page, book, or reading tracker before the day closes.",
    startedAt: "May 15, 2026",
    durationLabel: "7 days",
    creatorName: "Dare",
    creatorUsername: "dare",
    sponsoredByDare: true,
    proofLabel: "Reading proof",
    proofFiles: ["Book/page photo", "Reading tracker screenshot"],
    icon: "shield",
  },
  {
    id: "community-pushups-7-days",
    typeLabel: "Created by Dare",
    countdown: "04:57:11",
    titleTop: "Do 10 push-ups every day",
    titleAccent: "for 7 days",
    joinedCount: 0,
    friendNames: [],
    extraFriends: 0,
    survivors: 0,
    eliminated: 0,
    accent: "#facc15",
    secondaryAccent: "#4ade80",
    imageUrl:
      "https://images.unsplash.com/photo-1599058917212-d750089bc07e?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center",
    banner:
      "radial-gradient(circle at 22% 20%, rgba(250,204,21,0.3), transparent 23%), radial-gradient(circle at 78% 28%, rgba(74,222,128,0.26), transparent 24%), repeating-linear-gradient(150deg, rgba(255,255,255,0.045) 0 2px, transparent 2px 18px), linear-gradient(145deg, rgba(28,22,9,0.98), rgba(5,8,5,1) 58%, rgba(21,48,32,0.94))",
    description:
      "Complete 10 clean push-ups every day for a full week. Your daily proof should clearly show the push-up set or a short workout verification clip.",
    startedAt: "May 15, 2026",
    durationLabel: "7 days",
    creatorName: "Dare",
    creatorUsername: "dare",
    sponsoredByDare: true,
    proofLabel: "Workout proof",
    proofFiles: ["Short exercise video", "Fitness tracker screenshot"],
    icon: "flame",
  },
  {
    id: "community-unfiltered-photo",
    typeLabel: "Created by Dare",
    countdown: "09:24:05",
    titleTop: "Post one unfiltered casual photo",
    titleAccent: "every day for 5 days",
    joinedCount: 0,
    friendNames: [],
    extraFriends: 0,
    survivors: 0,
    eliminated: 0,
    accent: "#fb7185",
    secondaryAccent: "#38bdf8",
    imageUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center 28%",
    banner:
      "radial-gradient(circle at 20% 18%, rgba(251,113,133,0.32), transparent 24%), radial-gradient(circle at 78% 26%, rgba(56,189,248,0.24), transparent 25%), repeating-linear-gradient(118deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 15px), linear-gradient(145deg, rgba(34,13,22,0.98), rgba(5,7,7,1) 56%, rgba(18,38,48,0.94))",
    description:
      "Post one casual, unfiltered photo of yourself each day. The goal is consistency and confidence, not perfection.",
    startedAt: "May 15, 2026",
    durationLabel: "5 days",
    creatorName: "Dare",
    creatorUsername: "dare",
    sponsoredByDare: true,
    proofLabel: "Photo proof",
    proofFiles: ["Daily casual photo"],
    icon: "trophy",
  },
  {
    id: "community-wake-before-8",
    typeLabel: "Created by Dare",
    countdown: "12:36:29",
    titleTop: "Wake up before 8 AM every day",
    titleAccent: "for 30 days",
    joinedCount: 0,
    friendNames: [],
    extraFriends: 0,
    survivors: 0,
    eliminated: 0,
    accent: "#38bdf8",
    secondaryAccent: "#facc15",
    imageUrl:
      "https://images.unsplash.com/photo-1495364141860-b0d03eccd065?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center",
    banner:
      "radial-gradient(circle at 18% 20%, rgba(56,189,248,0.3), transparent 24%), radial-gradient(circle at 82% 18%, rgba(250,204,21,0.22), transparent 24%), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 18px), linear-gradient(145deg, rgba(11,27,36,0.98), rgba(4,8,6,1) 58%, rgba(39,31,13,0.92))",
    description:
      "Wake up before 8 AM every day for 30 days. Submit a morning proof before the window closes to stay in the challenge.",
    startedAt: "May 15, 2026",
    durationLabel: "30 days",
    creatorName: "Dare",
    creatorUsername: "dare",
    sponsoredByDare: true,
    proofLabel: "Morning proof",
    proofFiles: ["Alarm/time screenshot", "Morning photo"],
    icon: "shield",
  },
  {
    id: "community-nature-photo",
    typeLabel: "Created by Dare",
    countdown: "08:11:33",
    titleTop: "Post a nature photo every day",
    titleAccent: "for 10 days",
    joinedCount: 0,
    friendNames: [],
    extraFriends: 0,
    survivors: 0,
    eliminated: 0,
    accent: "#4ade80",
    secondaryAccent: "#a3e635",
    imageUrl:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1400&q=86",
    imagePosition: "center",
    banner:
      "radial-gradient(circle at 18% 20%, rgba(74,222,128,0.32), transparent 25%), radial-gradient(circle at 82% 26%, rgba(163,230,53,0.22), transparent 25%), repeating-linear-gradient(132deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 16px), linear-gradient(145deg, rgba(12,32,20,0.98), rgba(4,8,5,1) 56%, rgba(30,58,28,0.94))",
    description:
      "Capture and post one nature photo every day. It can be sky, plants, trees, sunlight, rain, or any outdoor detail you noticed.",
    startedAt: "May 15, 2026",
    durationLabel: "10 days",
    creatorName: "Dare",
    creatorUsername: "dare",
    sponsoredByDare: true,
    proofLabel: "Nature proof",
    proofFiles: ["Daily nature photo"],
    icon: "trophy",
  },
];

export function getCommunityChallengeTitle(
  challenge: CommunityChallenge,
): string {
  return `${challenge.titleTop} ${challenge.titleAccent}`.trim();
}
