import type { AuthUser } from "@/middleware/services/auth-v2.service";

export type GuestUserProfile = {
  id: string;
  name: string;
  username: string;
  avatarSeed: string;
  avatarUrl: string;
  bio: string;
  stats: {
    posts: number;
    daresCompleted: number;
    friends: number;
  };
};

export type GuestStory = {
  id: string;
  userId: string;
  label: string;
  accent: string;
  hasViewed: boolean;
};

export type GuestFeedPost = {
  id: string;
  authorId: string;
  caption: string;
  location: string;
  likes: number;
  comments: number;
  createdAt: string;
  accent: string;
  mediaLabel: string;
  imageUrl: string;
};

export type GuestTruthCard = {
  id: string;
  challengerId: string;
  receiverId: string;
  question: string;
  state: "ANSWERED" | "UNDER_REVIEW" | "APPROVED";
  answer?: string;
  truthVotes: number;
  lieVotes: number;
  createdAt: string;
};

export type GuestDareCard = {
  id: string;
  challengerId: string;
  receiverId: string;
  description: string;
  state: "SENT" | "PROOF_SUBMITTED" | "FRIENDS_VALIDATION" | "ACCEPTED_REAL";
  createdAt: string;
  proofLabel?: string;
  realVotes?: number;
  fakeVotes?: number;
};

export type GuestConversation = {
  id: string;
  userId: string;
  preview: string;
  unreadCount: number;
  updatedAt: string;
  messages: Array<{
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
  }>;
};

export type GuestSusAlert = {
  id: string;
  userId: string;
  type: "live_view" | "story_reaction" | "like_surge";
  timestamp: string;
  duration?: string;
  count?: number;
};

export type GuestAlert = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  type:
    | "like"
    | "comment"
    | "friend_request"
    | "dare"
    | "challenge"
    | "vote"
    | "message"
    | "profile";
  userId: string;
};

export type GuestActivity = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

export const guestUser: AuthUser = {
  id: "guest-demo-user",
  email: "guest@demo.local",
  username: "project_guest",
  displayName: "Project Guest",
  avatar: "",
  bio: "Review mode with curated mock activity across the app.",
  followersCount: 214,
  followingCount: 126,
  postsCount: 18,
  createdAt: "2026-04-02T09:00:00.000Z",
  updatedAt: "2026-05-04T17:30:00.000Z",
  lastActiveAt: "2026-05-05T09:00:00.000Z",
  isOnline: true,
  hasCompletedProfileCreation: true,
  is_18_plus: true,
  consent_accepted: true,
  notificationPreferences: {
    challenges: true,
    messages: true,
    friendRequests: true,
  },
};

export const guestUsers: GuestUserProfile[] = [
  {
    id: guestUser.id,
    name: guestUser.displayName,
    username: guestUser.username,
    avatarSeed: "PG",
    avatarUrl: "https://i.pravatar.cc/150?img=1",
    bio: "Review mode with curated mock activity across the app.",
    stats: { posts: 18, daresCompleted: 9, friends: 126 },
  },
  {
    id: "user-rhea",
    name: "Rhea Coleman",
    username: "rhea_rush",
    avatarSeed: "RC",
    avatarUrl: "https://i.pravatar.cc/150?img=5",
    bio: "Turning dares into stories and stories into trouble. Adventure seeker & content creator.",
    stats: { posts: 31, daresCompleted: 22, friends: 204 },
  },
  {
    id: "user-dev",
    name: "Dev Malhotra",
    username: "devafterdark",
    avatarSeed: "DM",
    avatarUrl: "https://i.pravatar.cc/150?img=11",
    bio: "Camera always rolling. Votes usually chaotic. Filmmaker & dare enthusiast.",
    stats: { posts: 27, daresCompleted: 15, friends: 189 },
  },
  {
    id: "user-zoe",
    name: "Zoe Bennett",
    username: "zoeonloop",
    avatarSeed: "ZB",
    avatarUrl: "https://i.pravatar.cc/150?img=9",
    bio: "Late-night truth dealer with a suspiciously good poker face. Psychology student.",
    stats: { posts: 14, daresCompleted: 11, friends: 95 },
  },
  {
    id: "user-kian",
    name: "Kian Foster",
    username: "kianplaysitcool",
    avatarSeed: "KF",
    avatarUrl: "https://i.pravatar.cc/150?img=3",
    bio: "Usually cool, occasionally convinced to sprint into nonsense. Music producer & DJ.",
    stats: { posts: 21, daresCompleted: 13, friends: 142 },
  },
  {
    id: "user-maya",
    name: "Maya Rodriguez",
    username: "mayawaves",
    avatarSeed: "MR",
    avatarUrl: "https://i.pravatar.cc/150?img=44",
    bio: "Surfer by day, dare taker by night. Always down for a challenge.",
    stats: { posts: 42, daresCompleted: 28, friends: 312 },
  },
  {
    id: "user-alex",
    name: "Alex Chen",
    username: "alexcodes",
    avatarSeed: "AC",
    avatarUrl: "https://i.pravatar.cc/150?img=12",
    bio: "Tech lead who can't resist a good truth. Building the future one dare at a time.",
    stats: { posts: 35, daresCompleted: 19, friends: 267 },
  },
  {
    id: "user-sarah",
    name: "Sarah Mitchell",
    username: "sarahspins",
    avatarSeed: "SM",
    avatarUrl: "https://i.pravatar.cc/150?img=32",
    bio: "Fitness instructor with a competitive streak. Bring it on.",
    stats: { posts: 28, daresCompleted: 24, friends: 198 },
  },
];

export const guestStories: GuestStory[] = [
  {
    id: "story-1",
    userId: "user-rhea",
    label: "Rooftop Jam",
    accent: "from-[#ff9966] to-[#ff5e62]",
    hasViewed: false,
  },
  {
    id: "story-2",
    userId: "user-dev",
    label: "Night Ride",
    accent: "from-[#36d1dc] to-[#5b86e5]",
    hasViewed: true,
  },
  {
    id: "story-3",
    userId: "user-zoe",
    label: "Truth Poll",
    accent: "from-[#c471f5] to-[#fa71cd]",
    hasViewed: false,
  },
  {
    id: "story-4",
    userId: "user-maya",
    label: "Sunset Surf",
    accent: "from-[#f6d365] to-[#fda085]",
    hasViewed: false,
  },
  {
    id: "story-5",
    userId: "user-alex",
    label: "Code Marathon",
    accent: "from-[#667eea] to-[#764ba2]",
    hasViewed: true,
  },
  {
    id: "story-6",
    userId: "user-sarah",
    label: "Morning Grind",
    accent: "from-[#11998e] to-[#38ef7d]",
    hasViewed: false,
  },
  {
    id: "story-7",
    userId: guestUser.id,
    label: "Guest Tour",
    accent: "from-[#11998e] to-[#38ef7d]",
    hasViewed: true,
  },
];

export const guestFeedPosts: GuestFeedPost[] = [
  {
    id: "post-1",
    authorId: "user-rhea",
    caption:
      "Lost a vote, had to perform a one-song rooftop set before sunrise. Worth it.",
    location: "Downtown Roof",
    likes: 182,
    comments: 24,
    createdAt: "2026-05-04T04:30:00.000Z",
    accent: "from-[#2b5876] via-[#4e4376] to-[#8f94fb]",
    mediaLabel: "Live rooftop acoustic clip",
    imageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80",
  },
  {
    id: "post-2",
    authorId: "user-dev",
    caption: "Proof that the silent disco dare turned into a full parade.",
    location: "River Walk",
    likes: 241,
    comments: 38,
    createdAt: "2026-05-03T18:00:00.000Z",
    accent: "from-[#1f4037] via-[#2c7744] to-[#99f2c8]",
    mediaLabel: "Crowd dance reel thumbnail",
    imageUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
  },
  {
    id: "post-3",
    authorId: "user-maya",
    caption:
      "Surfing at dawn after a dare to catch the first wave. Cold but incredible.",
    location: "Sunset Beach",
    likes: 312,
    comments: 45,
    createdAt: "2026-05-04T06:15:00.000Z",
    accent: "from-[#ff9a9e] via-[#fecfef] to-[#fecfef]",
    mediaLabel: "Morning surf session",
    imageUrl:
      "https://images.unsplash.com/photo-1502680390499-be4c1b794e73?w=800&q=80",
  },
  {
    id: "post-4",
    authorId: "user-alex",
    caption: "Built this entire feature in one night. Coffee is my superpower.",
    location: "Home Office",
    likes: 156,
    comments: 28,
    createdAt: "2026-05-03T22:30:00.000Z",
    accent: "from-[#a18cd1] via-[#fbc2eb] to-[#a6c1ee]",
    mediaLabel: "Coding setup timelapse",
    imageUrl:
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80",
  },
  {
    id: "post-5",
    authorId: "user-sarah",
    caption: "Morning workout complete. 5AM club never disappoints.",
    location: "City Gym",
    likes: 289,
    comments: 52,
    createdAt: "2026-05-04T05:45:00.000Z",
    accent: "from-[#f093fb] via-[#f5576c] to-[#f093fb]",
    mediaLabel: "Training session highlight",
    imageUrl:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80",
  },
  {
    id: "post-6",
    authorId: "user-zoe",
    caption: "Truth or dare tournament champion. The poker face paid off.",
    location: "Game Night",
    likes: 198,
    comments: 33,
    createdAt: "2026-05-02T20:00:00.000Z",
    accent: "from-[#4facfe] via-[#00f2fe] to-[#4facfe]",
    mediaLabel: "Victory celebration",
    imageUrl:
      "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80",
  },
  {
    id: "post-7",
    authorId: guestUser.id,
    caption:
      "Guest mode mirrors the app experience with safe demo content and no backend writes.",
    location: "Project Preview",
    likes: 96,
    comments: 12,
    createdAt: "2026-05-02T12:15:00.000Z",
    accent: "from-[#232526] via-[#414345] to-[#6d7278]",
    mediaLabel: "Feature walkthrough snapshot",
    imageUrl:
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&q=80",
  },
];

export const guestTruthCards: GuestTruthCard[] = [
  {
    id: "truth-1",
    challengerId: "user-zoe",
    receiverId: guestUser.id,
    question:
      "Did you actually build the first version of this app in a single weekend?",
    state: "ANSWERED",
    answer: "Yes, and the animations got cleaned up in the weeks after.",
    truthVotes: 22,
    lieVotes: 4,
    createdAt: "2026-05-04T08:40:00.000Z",
  },
  {
    id: "truth-2",
    challengerId: "user-kian",
    receiverId: "user-rhea",
    question:
      "Who takes longer to approve a dare: the challenger or the group chat?",
    state: "UNDER_REVIEW",
    answer: "The group chat. Always the group chat.",
    truthVotes: 17,
    lieVotes: 6,
    createdAt: "2026-05-03T20:00:00.000Z",
  },
  {
    id: "truth-3",
    challengerId: "user-maya",
    receiverId: "user-sarah",
    question: "Have you ever skipped a workout to go surfing instead?",
    state: "ANSWERED",
    answer: "Guilty as charged. The waves were too good to pass up.",
    truthVotes: 28,
    lieVotes: 2,
    createdAt: "2026-05-04T07:30:00.000Z",
  },
  {
    id: "truth-4",
    challengerId: "user-alex",
    receiverId: "user-dev",
    question:
      "Is it true you once deployed to production at 3 AM without testing?",
    state: "APPROVED",
    answer: "I prefer to call it 'aggressive deployment strategy'.",
    truthVotes: 35,
    lieVotes: 8,
    createdAt: "2026-05-02T14:00:00.000Z",
  },
  {
    id: "truth-5",
    challengerId: guestUser.id,
    receiverId: "user-kian",
    question: "Did you really lose your phone during that scavenger hunt dare?",
    state: "ANSWERED",
    answer: "Yes. Found it 2 hours later in a bush. Still worth it.",
    truthVotes: 19,
    lieVotes: 3,
    createdAt: "2026-05-03T00:30:00.000Z",
  },
  {
    id: "truth-6",
    challengerId: "user-sarah",
    receiverId: "user-maya",
    question: "Have you ever faked being sick to get out of a dare?",
    state: "UNDER_REVIEW",
    answer: "Never. I take my dares seriously.",
    truthVotes: 15,
    lieVotes: 12,
    createdAt: "2026-05-04T12:00:00.000Z",
  },
];

export const guestDareCards: GuestDareCard[] = [
  {
    id: "dare-1",
    challengerId: "user-dev",
    receiverId: guestUser.id,
    description:
      "Order the spiciest item on the menu and narrate the experience like a sports commentator.",
    state: "FRIENDS_VALIDATION",
    createdAt: "2026-05-04T10:15:00.000Z",
    proofLabel: "Restaurant reaction montage",
    realVotes: 14,
    fakeVotes: 3,
  },
  {
    id: "dare-2",
    challengerId: guestUser.id,
    receiverId: "user-kian",
    description:
      "Lead a midnight scavenger hunt using only terrible clues and one flashlight.",
    state: "ACCEPTED_REAL",
    createdAt: "2026-05-02T23:15:00.000Z",
    proofLabel: "Three-part scavenger story",
    realVotes: 29,
    fakeVotes: 1,
  },
  {
    id: "dare-3",
    challengerId: "user-rhea",
    receiverId: "user-zoe",
    description:
      "Pitch a fake startup to strangers for five minutes without laughing.",
    state: "PROOF_SUBMITTED",
    createdAt: "2026-05-01T15:45:00.000Z",
    proofLabel: "Street interview supercut",
    realVotes: 8,
    fakeVotes: 2,
  },
  {
    id: "dare-4",
    challengerId: "user-maya",
    receiverId: "user-sarah",
    description:
      "Do a full workout routine in a public park while wearing formal attire.",
    state: "SENT",
    createdAt: "2026-05-04T14:30:00.000Z",
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "dare-5",
    challengerId: "user-alex",
    receiverId: "user-dev",
    description:
      "Explain your most embarrassing coding bug to a random person on the street as if it's a life-or-death situation.",
    state: "PROOF_SUBMITTED",
    createdAt: "2026-05-03T11:00:00.000Z",
    proofLabel: "Confused stranger reaction",
    realVotes: 12,
    fakeVotes: 4,
  },
  {
    id: "dare-6",
    challengerId: "user-sarah",
    receiverId: guestUser.id,
    description:
      "Hold a plank for 2 minutes while reciting the alphabet backwards every time someone walks by.",
    state: "FRIENDS_VALIDATION",
    createdAt: "2026-05-04T09:00:00.000Z",
    proofLabel: "Gym challenge video",
    realVotes: 18,
    fakeVotes: 2,
  },
  {
    id: "dare-7",
    challengerId: "user-zoe",
    receiverId: "user-maya",
    description:
      "Go to a coffee shop and order using only movie quotes for 10 minutes straight.",
    state: "ACCEPTED_REAL",
    createdAt: "2026-05-02T16:45:00.000Z",
    proofLabel: "Barista confusion compilation",
    realVotes: 31,
    fakeVotes: 5,
  },
  {
    id: "dare-8",
    challengerId: "user-kian",
    receiverId: "user-alex",
    description:
      "Create and perform a 30-second rap about your daily commute to a crowded subway car.",
    state: "SENT",
    createdAt: "2026-05-04T08:15:00.000Z",
    realVotes: 0,
    fakeVotes: 0,
  },
];

export const guestConversations: GuestConversation[] = [
  {
    id: "conv-1",
    userId: "user-dev",
    preview: "I left the proof clip in the shared drive. Use the second take.",
    unreadCount: 2,
    updatedAt: "2026-05-04T19:15:00.000Z",
    messages: [
      {
        id: "m-1",
        senderId: "user-dev",
        text: "The crowd actually cheered after the dare.",
        createdAt: "2026-05-04T19:10:00.000Z",
      },
      {
        id: "m-2",
        senderId: guestUser.id,
        text: "That makes the proof card way stronger.",
        createdAt: "2026-05-04T19:12:00.000Z",
      },
      {
        id: "m-3",
        senderId: "user-dev",
        text: "I left the proof clip in the shared drive. Use the second take.",
        createdAt: "2026-05-04T19:15:00.000Z",
      },
    ],
  },
  {
    id: "conv-2",
    userId: "user-rhea",
    preview:
      "Guest mode looks clean. The search screen feels especially convincing.",
    unreadCount: 0,
    updatedAt: "2026-05-03T13:00:00.000Z",
    messages: [
      {
        id: "m-4",
        senderId: guestUser.id,
        text: "Can you review the mock profile flow?",
        createdAt: "2026-05-03T12:54:00.000Z",
      },
      {
        id: "m-5",
        senderId: "user-rhea",
        text: "Guest mode looks clean. The search screen feels especially convincing.",
        createdAt: "2026-05-03T13:00:00.000Z",
      },
    ],
  },
  {
    id: "conv-3",
    userId: "user-maya",
    preview: "The waves tomorrow morning are going to be epic!",
    unreadCount: 1,
    updatedAt: "2026-05-04T18:30:00.000Z",
    messages: [
      {
        id: "m-6",
        senderId: "user-maya",
        text: "The waves tomorrow morning are going to be epic!",
        createdAt: "2026-05-04T18:30:00.000Z",
      },
    ],
  },
  {
    id: "conv-4",
    userId: "user-sarah",
    preview: "Are you coming to the 5AM workout tomorrow?",
    unreadCount: 0,
    updatedAt: "2026-05-04T16:45:00.000Z",
    messages: [
      {
        id: "m-7",
        senderId: "user-sarah",
        text: "Are you coming to the 5AM workout tomorrow?",
        createdAt: "2026-05-04T16:45:00.000Z",
      },
      {
        id: "m-8",
        senderId: guestUser.id,
        text: "Wouldn't miss it. See you there!",
        createdAt: "2026-05-04T16:50:00.000Z",
      },
    ],
  },
  {
    id: "conv-5",
    userId: "user-alex",
    preview: "Just pushed the new feature. Want to test it?",
    unreadCount: 3,
    updatedAt: "2026-05-04T15:20:00.000Z",
    messages: [
      {
        id: "m-9",
        senderId: "user-alex",
        text: "Just pushed the new feature. Want to test it?",
        createdAt: "2026-05-04T15:20:00.000Z",
      },
      {
        id: "m-10",
        senderId: "user-alex",
        text: "Added some cool animations.",
        createdAt: "2026-05-04T15:22:00.000Z",
      },
      {
        id: "m-11",
        senderId: "user-alex",
        text: "Let me know if you find any bugs!",
        createdAt: "2026-05-04T15:25:00.000Z",
      },
    ],
  },
];

export const guestAlerts: GuestAlert[] = [
  {
    id: "alert-1",
    title: "Dare awaiting votes",
    body: "Your spicy commentary dare has entered friends validation.",
    createdAt: "2026-05-04T10:30:00.000Z",
    type: "dare",
    userId: "user-rhea",
  },
  {
    id: "alert-2",
    title: "New message",
    body: "Dev sent a proof clip suggestion in chat.",
    createdAt: "2026-05-04T19:15:00.000Z",
    type: "comment",
    userId: "user-dev",
  },
  {
    id: "alert-3",
    title: "Profile view spike",
    body: "Your demo profile was viewed 18 times during a project walkthrough.",
    createdAt: "2026-05-03T16:00:00.000Z",
    type: "like",
    userId: "user-zoe",
  },
  {
    id: "alert-4",
    title: "Truth approved",
    body: "Zoe approved your answer about the weekend build!",
    createdAt: "2026-05-04T09:00:00.000Z",
    type: "like",
    userId: "user-zoe",
  },
  {
    id: "alert-5",
    title: "Dare challenge accepted",
    body: "Maya accepted your rooftop dare. Proof due in 24 hours.",
    createdAt: "2026-05-04T08:00:00.000Z",
    type: "challenge",
    userId: "user-maya",
  },
];

export const guestSusAlerts: GuestSusAlert[] = [
  {
    id: "sus-1",
    userId: "user-rhea",
    type: "live_view",
    timestamp: new Date().toISOString(),
    duration: "2m 34s",
  },
  {
    id: "sus-2",
    userId: "user-dev",
    type: "live_view",
    timestamp: new Date().toISOString(),
    duration: "1m 12s",
  },
  {
    id: "sus-3",
    userId: "user-zoe",
    type: "story_reaction",
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    count: 3,
  },
  {
    id: "sus-4",
    userId: "user-maya",
    type: "like_surge",
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    count: 12,
  },
];

export const guestActivity: GuestActivity[] = [
  {
    id: "activity-1",
    title: "Truth answered",
    detail: "You answered Zoe's weekend build question.",
    createdAt: "2026-05-04T08:42:00.000Z",
  },
  {
    id: "activity-2",
    title: "Proof submitted",
    detail: "Kian uploaded scavenger hunt footage for review.",
    createdAt: "2026-05-02T23:50:00.000Z",
  },
  {
    id: "activity-3",
    title: "Feed post shared",
    detail: "Rhea's rooftop post was shared into chat.",
    createdAt: "2026-05-01T09:10:00.000Z",
  },
  {
    id: "activity-4",
    title: "Dare completed",
    detail: "You completed Maya's workout dare with style.",
    createdAt: "2026-05-04T11:30:00.000Z",
  },
  {
    id: "activity-5",
    title: "New follower",
    detail: "Alex started following your profile.",
    createdAt: "2026-05-03T14:20:00.000Z",
  },
  {
    id: "activity-6",
    title: "Story viewed",
    detail: "Sarah viewed your guest tour story.",
    createdAt: "2026-05-04T07:15:00.000Z",
  },
  {
    id: "activity-7",
    title: "Vote received",
    detail: "Dev voted your truth answer as TRUE.",
    createdAt: "2026-05-04T09:45:00.000Z",
  },
];
