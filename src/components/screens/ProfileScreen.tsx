"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  Target,
  Eye,
  Settings,
  Camera,
  Heart,
  MessageCircle,
  Share2,
  Clock,
  CheckCircle,
  Shield,
  Zap,
  LogOut,
  Play,
  X,
  Star,
  Activity,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import "@/styles/design-system.css";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { usePostsStore } from "../../stores/usePostsStore";
import { useUserProfileStore } from "../../stores/useUserProfileStore";
import { useDareStore } from "../../stores/useDareStore";
import { PostsScreen } from "./PostsScreen";
import { ProfileEditScreen } from "./ProfileEditScreen";
import { FriendsScreen } from "./FriendsScreen";
import { Avatar } from "../ui/Avatar";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { getAggressiveAvatar, useAvatarStore } from "../../stores/avatarStore";
import { avatarSyncService } from "@/services/avatarSyncService";
import { friendsService } from "../../middleware/services/service-factory";
import { closeFriendsService } from "../../middleware/services/service-factory";
import { formatTimeAgo } from "../../utils/timeFormat";
import { TruthsListScreen } from "./TruthsListScreen";
import { DaresListScreen } from "./DaresListScreen";
import {
  dareService,
  truthService,
} from "../../middleware/services/service-factory";
import type {
  TruthPost,
  DarePost,
} from "../../middleware/adapters/data-adapters";
import { resolveUserProfile } from "../../utils/profileResolver";
import { db } from "../../backend/lib/firebase";
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { TruthEntity } from "../../backend/domain/entities/Truth";

interface ProfileStats {
  daresCompleted: number;
  daresSurrendered: number;
  friends: number;
}

type ProfileTabLoadState = {
  truthsLoadedForUserId: string | null;
  daresLoadedForUserId: string | null;
};

type ProfileHeaderCounts = {
  dares: number | null;
  truths: number | null;
};

type ProfileCountCollection = "dares" | "truths";

interface ProfileScreenProps {
  isActive?: boolean;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToActivity?: () => void;
  onNavigateToTruthPost?: (truth: TruthPost) => void;
  onNavigateToDarePost?: (dare: DarePost) => void;
}

function toSafeCount(value: unknown): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;

  return Number.isFinite(numericValue) ? numericValue : 0;
}

const profileCache = new Map<string, any>();

async function fetchProfile(userId: string): Promise<any | null> {
  if (!userId) return null;
  if (profileCache.has(userId)) return profileCache.get(userId);

  try {
    const resolvedProfile = await resolveUserProfile(userId);
    if (resolvedProfile) {
      profileCache.set(userId, resolvedProfile);
      return resolvedProfile;
    }
  } catch (_error) {
    // Fall back to direct query when lookup strategy differs.
  }

  try {
    const snapshot = await getDocs(
      query(collection(db, "users"), where("user_id", "==", userId)),
    );

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      const docId = snapshot.docs[0].id;
      const profile = {
        id: data.user_id || docId,
        userId: data.user_id || docId,
        displayName: data.display_name,
        username: data.username,
        nickname: data.display_name || data.nickname,
        avatarUrl: data.avatar_url,
      };
      profileCache.set(userId, profile);
      return profile;
    }
  } catch (_error) {
    // Keep null cache entry to avoid repeated failed reads in one session.
  }

  profileCache.set(userId, null);
  return null;
}

function extractName(profile: any, userId: string): string {
  if (profile && typeof profile === "object") {
    const name =
      profile.displayName ||
      profile.username ||
      profile.nickname ||
      profile.display_name;

    if (typeof name === "string" && name.trim().length > 0) {
      return name.trim();
    }
  }

  return userId || "Unknown";
}

function extractAvatar(profile: any): string {
  if (profile && typeof profile === "object") {
    const url = profile.avatarUrl || profile.avatar_url || profile.photoURL;
    if (typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }

  return "/default-avatar.png";
}

async function countUserChallengeDocs(
  collectionName: ProfileCountCollection,
  userId: string,
): Promise<number> {
  const [sentSnapshot, receivedSnapshot] = await Promise.all([
    getCountFromServer(
      query(
        collection(db, collectionName),
        where("challenger_id", "==", userId),
      ),
    ),
    getCountFromServer(
      query(
        collection(db, collectionName),
        where("receiver_id", "==", userId),
      ),
    ),
  ]);

  return sentSnapshot.data().count + receivedSnapshot.data().count;
}

async function buildTruthPost(truth: TruthEntity): Promise<TruthPost | null> {
  try {
    const [challengerProfile, receiverProfile] = await Promise.all([
      fetchProfile(truth.challengerId),
      fetchProfile(truth.receiverId),
    ]);

    return {
      id: truth.id,
      challengerId: truth.challengerId,
      receiverId: truth.receiverId,
      challenger: {
        nickname: extractName(challengerProfile, truth.challengerId),
        avatar: extractAvatar(challengerProfile),
        verified: false,
      },
      receiver: {
        nickname: extractName(receiverProfile, truth.receiverId),
        avatar: extractAvatar(receiverProfile),
        verified: false,
      },
      question: truth.question,
      state: truth.state as TruthPost["state"],
      createdAt: truth.createdAt,
      answer: truth.answer,
    };
  } catch (error) {
    console.error(`[ProfileScreen] Failed to build truth ${truth.id}:`, error);
    return null;
  }
}

async function buildDarePost(dare: any): Promise<DarePost | null> {
  try {
    const [challengerProfile, receiverProfile] = await Promise.all([
      fetchProfile(dare.challengerId),
      fetchProfile(dare.receiverId),
    ]);

    return {
      id: dare.id,
      challengerId: dare.challengerId,
      receiverId: dare.receiverId,
      challenger: {
        nickname: extractName(challengerProfile, dare.challengerId),
        avatar: extractAvatar(challengerProfile),
        verified: false,
      },
      receiver: {
        nickname: extractName(receiverProfile, dare.receiverId),
        avatar: extractAvatar(receiverProfile),
        verified: false,
      },
      description: dare.description,
      proof: dare.proofMediaUrl
        ? {
            type: (dare.proofMediaType === "VIDEO" ? "video" : "image") as
              | "video"
              | "image",
            url: dare.proofMediaUrl,
            thumbnail: dare.proofMediaUrl,
          }
        : undefined,
      state: dare.state as DarePost["state"],
      createdAt: dare.createdAt,
    };
  } catch (error) {
    console.error(`[ProfileScreen] Failed to build dare ${dare.id}:`, error);
    return null;
  }
}

export function ProfileScreen({
  isActive = true,
  onNavigateToProfile,
  onNavigateToActivity,
  onNavigateToTruthPost,
  onNavigateToDarePost,
}: ProfileScreenProps = {}) {
  const [activeTab, setActiveTab] = useState<"posts" | "truths" | "dares">(
    "posts",
  );
  const { user, signOut, subscribe, uploadAvatar } = useAuthStore();
  const {
    posts: storePosts,
    userPosts,
    loadUserPosts,
    loadingUserPosts,
    subscribeToUserPosts,
    unsubscribeFromUserPosts,
  } = usePostsStore();
  const { profile, friendsCount, loadProfile } = useUserProfileStore();
  const { sentDares, receivedDares, loadUserDares } = useDareStore();
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [showPostsScreen, setShowPostsScreen] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showFriendsScreen, setShowFriendsScreen] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [showTruthsListScreen, setShowTruthsListScreen] = useState(false);
  const [showDaresListScreen, setShowDaresListScreen] = useState(false);
  const [initialTruthId, setInitialTruthId] = useState<string | undefined>(
    undefined,
  );
  const [initialDareId, setInitialDareId] = useState<string | undefined>(
    undefined,
  );
  const [truthPosts, setTruthPosts] = useState<TruthPost[]>([]);
  const [darePosts, setDarePosts] = useState<DarePost[]>([]);
  const [loadingTruth, setLoadingTruth] = useState(false);
  const [loadingDares, setLoadingDares] = useState(false);
  const [loadedState, setLoadedState] = useState<ProfileTabLoadState>({
    truthsLoadedForUserId: null,
    daresLoadedForUserId: null,
  });
  const [profileHeaderCounts, setProfileHeaderCounts] =
    useState<ProfileHeaderCounts>({
      dares: null,
      truths: null,
    });
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // Handle logout
  const handleLogout = async () => {
    // TEMPORARILY DISABLED FOR MOBILE DEBUGGING - Remove isLoggingOut state to prevent button being stuck disabled
    // DISABLED: setIsLoggingOut(true);

    try {
      console.log("🚪 Attempting logout...");
      await signOut();
      console.log("✅ Logout successful");
      // The app should automatically redirect to auth screen due to isAuthenticated change
    } catch (error) {
      console.error("❌ LOGOUT ERROR:", error);
      alert(
        `Logout failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      // DISABLED: setIsLoggingOut(false);
    }
  };

  // Subscribe to auth changes to ensure profile updates are reflected
  useEffect(() => {
    const unsubscribe = subscribe((_updatedUser) => {});
    return () => unsubscribe();
  }, [subscribe]);

  // Load user profile and friends count when component mounts or user changes
  useEffect(() => {
    if (isActive && user?.id) {
      subscribeToUserPosts(user.id);
      loadProfile(user.id);
      loadUserDares(user.id, "all");

      // Cleanup subscription when user changes or component unmounts
      return () => {
        unsubscribeFromUserPosts();
      };
    }
  }, [
    isActive,
    user?.id,
    subscribeToUserPosts,
    unsubscribeFromUserPosts,
    loadProfile,
    loadUserDares,
  ]);

  const loadProfileHeaderCounts = useCallback(async (userId: string) => {
    const [dares, truths] = await Promise.all([
      countUserChallengeDocs("dares", userId),
      countUserChallengeDocs("truths", userId),
    ]);

    return { dares, truths };
  }, []);

  useEffect(() => {
    if (!isActive || !user?.id) {
      setProfileHeaderCounts({ dares: null, truths: null });
      return;
    }

    let isCancelled = false;
    setProfileHeaderCounts({ dares: null, truths: null });
    void loadProfileHeaderCounts(user.id)
      .then((counts) => {
        if (!isCancelled) {
          setProfileHeaderCounts(counts);
        }
      })
      .catch((error) => {
        console.warn("[ProfileScreen] Failed to load profile counts:", error);
        if (!isCancelled) {
          setProfileHeaderCounts({ dares: null, truths: null });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isActive, user?.id, loadProfileHeaderCounts]);

  const loadProfileTruthPosts = useCallback(async (userId: string) => {
    setLoadingTruth(true);

    try {
      const response = await truthService.getUserTruths(userId, "all");
      const rawTruths = (response.success ? response.truths : []) ?? [];
      const uniqueTruths = rawTruths.filter((truth: TruthEntity, index) => {
        return (
          rawTruths.findIndex((candidate: TruthEntity) => {
            return candidate?.id === truth?.id;
          }) === index
        );
      });
      const builtTruths = await Promise.all(uniqueTruths.map(buildTruthPost));

      setTruthPosts(
        builtTruths.filter((truth): truth is TruthPost => truth !== null),
      );
      setLoadedState((current) => ({
        ...current,
        truthsLoadedForUserId: userId,
      }));
    } catch (error) {
      console.error("[ProfileScreen] Failed to load profile truths:", error);
      setTruthPosts([]);
      setLoadedState((current) => ({
        ...current,
        truthsLoadedForUserId: userId,
      }));
    } finally {
      setLoadingTruth(false);
    }
  }, []);

  const loadProfileDarePosts = useCallback(async (userId: string) => {
    setLoadingDares(true);

    try {
      const response = await dareService.getDaresForUser(userId);
      const rawDares = (response.success ? response.dares : []) ?? [];
      const uniqueDares = rawDares.filter((dare: any, index: number) => {
        return (
          rawDares.findIndex((candidate: any) => {
            return candidate?.id === dare?.id;
          }) === index
        );
      });

      uniqueDares.sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const builtDares = await Promise.all(uniqueDares.map(buildDarePost));

      setDarePosts(
        builtDares.filter((dare): dare is DarePost => dare !== null),
      );
      setLoadedState((current) => ({
        ...current,
        daresLoadedForUserId: userId,
      }));
    } catch (error) {
      console.error("[ProfileScreen] Failed to load profile dares:", error);
      setDarePosts([]);
      setLoadedState((current) => ({
        ...current,
        daresLoadedForUserId: userId,
      }));
    } finally {
      setLoadingDares(false);
    }
  }, []);

  // Load truth/dare posts when those tabs are activated without sharing feed state.
  useEffect(() => {
    if (!isActive || !user?.id) return;
    if (
      activeTab === "truths" &&
      !loadingTruth &&
      loadedState.truthsLoadedForUserId !== user.id
    ) {
      void loadProfileTruthPosts(user.id);
    }
    if (
      activeTab === "dares" &&
      !loadingDares &&
      loadedState.daresLoadedForUserId !== user.id
    ) {
      void loadProfileDarePosts(user.id);
    }
  }, [
    activeTab,
    isActive,
    user?.id,
    loadingTruth,
    loadingDares,
    loadedState.truthsLoadedForUserId,
    loadedState.daresLoadedForUserId,
    loadProfileTruthPosts,
    loadProfileDarePosts,
  ]);

  // Handler for opening friends screen
  const handleFriendsClick = () => {
    setShowFriendsScreen(true);
  };

  const profileData = useProfileDataStore();
  const displayName =
    user?.id &&
    profileData.currentUserId === user.id &&
    profileData.currentDisplayName
      ? profileData.currentDisplayName
      : user?.displayName || user?.username || "User";
  const username =
    user?.id &&
    profileData.currentUserId === user.id &&
    profileData.currentUsername
      ? profileData.currentUsername
      : user?.username || "user";
  const currentAvatarFromStore = useAvatarStore((state) =>
    user?.id
      ? state.userAvatars[user.id] || state.globalAvatar
      : state.globalAvatar,
  );
  const avatarPreviewSrc =
    getAggressiveAvatar(
      currentAvatarFromStore || user?.avatar,
      "/default-avatar.png",
      user?.id,
      username,
    ) || "/default-avatar.png";

  const handleAvatarTap = () => {
    setShowAvatarPreview(true);
  };

  const handleAvatarUploadClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    avatarFileInputRef.current?.click();
  };

  const handleAvatarFileSelect = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const response = await uploadAvatar(file);
      if (!response.success) {
        alert(response.error || "Unable to upload avatar.");
        return;
      }

      if (user?.id) {
        await avatarSyncService.refreshUserAvatar(user.id);
      }
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Unable to upload avatar.",
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const allUserDares = [...sentDares, ...receivedDares];
  const loadedUserDaresCount = new Set(
    allUserDares.map((dare) => dare.id).filter(Boolean),
  ).size;
  const surrenderedDaresCount = allUserDares.filter(
    (dare) => dare.state === "CHICKEN_OUT",
  ).length;
  const fallbackProfileDaresCount = toSafeCount(
    (profile as any)?.daresCount ??
      (profile as any)?.dares_count ??
      (profile as any)?.daresCompleted ??
      (profile as any)?.dares_completed,
  );
  const profileDaresCount =
    profileHeaderCounts.dares ??
    (loadedUserDaresCount > 0
      ? loadedUserDaresCount
      : fallbackProfileDaresCount);

  // In production mode, profile stats come from backend
  // Start with empty stats - will be populated by real data
  const profileStats: ProfileStats = {
    daresCompleted: profileDaresCount,
    daresSurrendered:
      surrenderedDaresCount > 0
        ? surrenderedDaresCount
        : toSafeCount(
            (profile as any)?.daresRefused ?? (profile as any)?.dares_refused,
          ),
    friends: toSafeCount(friendsCount), // Use actual friends count from useUserProfileStore
  };
  // Keep ProfileScreen locked to the authenticated user's own posts only.
  // `userPosts` is shared in the store and can temporarily hold another user's
  // posts when visiting their profile, so we hard-filter here.
  const currentUserPosts = (userPosts || []).filter(
    (post) => !user?.id || post.author?.id === user.id,
  );

  // Deduplicate the current user's posts so profile grid and posts screen stay in sync.
  const uniquePosts = currentUserPosts.filter(
    (post, index, self) => self.findIndex((p) => p.id === post.id) === index,
  );

  // Sort posts by timestamp descending (latest first) like Instagram
  const sortedPosts = [...uniquePosts].sort((a, b) => {
    const timestampA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timestampB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timestampB - timestampA;
  });

  const userTruthPosts = truthPosts.filter(
    (truth) =>
      !user?.id ||
      truth.challengerId === user.id ||
      truth.receiverId === user.id,
  );
  const fallbackProfileTruthsCount = toSafeCount(
    (profile as any)?.truthsCount ??
      (profile as any)?.truths_count ??
      (profile as any)?.truthsAnswered ??
      (profile as any)?.truths_answered,
  );
  const profileTruthsCount =
    profileHeaderCounts.truths ??
    (userTruthPosts.length > 0
      ? userTruthPosts.length
      : fallbackProfileTruthsCount);

  const userDarePosts = darePosts.filter(
    (dare) =>
      !user?.id || dare.challengerId === user.id || dare.receiverId === user.id,
  );

  if (showPostsScreen) {
    return (
      <PostsScreen
        onBack={() => {
          setShowPostsScreen(false);
        }}
        posts={sortedPosts}
        onNavigateToProfile={onNavigateToProfile}
        userName={displayName}
        targetUserId={user?.id}
      />
    );
  }

  if (showTruthsListScreen) {
    return (
      <TruthsListScreen
        userId={user?.id}
        onBack={() => {
          setShowTruthsListScreen(false);
          setInitialTruthId(undefined);
        }}
        truthPosts={userTruthPosts}
        loading={loadingTruth}
        initialTruthId={initialTruthId}
        onSelectTruth={(truth) => {
          setShowTruthsListScreen(false);
          setInitialTruthId(undefined);
          onNavigateToTruthPost?.(truth);
        }}
      />
    );
  }

  if (showDaresListScreen) {
    return (
      <DaresListScreen
        userId={user?.id}
        onBack={() => {
          setShowDaresListScreen(false);
          setInitialDareId(undefined);
        }}
        darePosts={userDarePosts}
        loading={loadingDares}
        initialDareId={initialDareId}
        onSelectDare={(dare) => {
          setShowDaresListScreen(false);
          setInitialDareId(undefined);
          onNavigateToDarePost?.(dare);
        }}
      />
    );
  }

  const PostCard = ({ post }: { post: any }) => {
    const [touched, setTouched] = useState(false);
    return (
      <div
        onMouseDown={() => setTouched(true)}
        onMouseUp={() => setTouched(false)}
        onMouseLeave={() => setTouched(false)}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: touched
            ? "2px solid rgba(74,222,128,0.7)"
            : "2px solid rgba(255,255,255,0.08)",
          borderRadius: "28px",
          padding: "20px 20px 18px",
          marginBottom: "24px",
          marginLeft: "-6px",
          marginRight: "-6px",
          backdropFilter: "blur(10px)",
          boxShadow: touched
            ? "0 0 0 1px rgba(74,222,128,0.15), 0 0 30px rgba(74,222,128,0.18), 0 4px 24px rgba(0,0,0,0.4)"
            : "0 4px 24px rgba(0,0,0,0.3)",
          transition: "border 0.15s ease, box-shadow 0.15s ease",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4ade80, #22c55e)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid rgba(74,222,128,0.5)",
                }}
              >
                <span
                  style={{ color: "#000", fontWeight: 700, fontSize: "17px" }}
                >
                  Y
                </span>
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: "-2px",
                  right: "-2px",
                  width: "18px",
                  height: "18px",
                  background: "#4ade80",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1.5px solid #0a0a0a",
                }}
              >
                <CheckCircle size={11} color="#000" />
              </div>
            </div>
            <div>
              <p
                style={{
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "16px",
                  margin: 0,
                }}
              >
                {displayName}
              </p>
              <p
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "13px",
                  margin: 0,
                }}
              >
                {username}
              </p>
            </div>
          </div>
          <button
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <Settings size={15} />
          </button>
        </div>

        {/* Dare badge (before image for dare posts) */}
        {post.type === "dare" && post.dareState && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              background: "rgba(74,222,128,0.15)",
              border: "1px solid rgba(74,222,128,0.4)",
              borderRadius: "999px",
              padding: "4px 12px",
              marginBottom: "12px",
            }}
          >
            <Target size={12} color="#4ade80" />
            <span
              style={{ color: "#4ade80", fontSize: "12px", fontWeight: 600 }}
            >
              Completed
            </span>
          </div>
        )}

        {/* Image — full width, tall, edge-to-edge inside card */}
        {post.media && (
          <div style={{ margin: "6px -17px 16px -17px" }}>
            <div style={{ borderRadius: "14px", overflow: "hidden" }}>
              {post.media.type === "image" ? (
                <img
                  src={post.media.url}
                  alt="Post"
                  style={{
                    width: "100%",
                    height: "440px",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ position: "relative", height: "440px" }}>
                  <img
                    src={post.media.thumbnail || post.media.url}
                    alt="Video"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        background: "rgba(255,255,255,0.15)",
                        borderRadius: "50%",
                        display: "none",
                        alignItems: "center",
                        justifyContent: "center",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      <Zap size={22} color="#fff" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action row — like, comment, share — matching reference layout */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "12px",
          }}
        >
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: 500,
              padding: 0,
            }}
          >
            <Heart size={22} strokeWidth={1.8} />
            <span>{post.stats.likes}</span>
          </button>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: 500,
              padding: 0,
            }}
          >
            <MessageCircle size={22} strokeWidth={1.8} />
            <span>{post.stats.comments}</span>
          </button>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: 500,
              padding: 0,
              marginLeft: "2px",
            }}
          >
            <Share2 size={20} strokeWidth={1.8} />
          </button>
        </div>

        {/* Caption — @username bold + text inline, like reference */}
        <p
          style={{
            color: "rgba(255,255,255,0.9)",
            fontSize: "14px",
            lineHeight: "1.55",
            margin: "0 0 6px",
          }}
        >
          <span style={{ fontWeight: 700 }}>@{username}</span> {post.content}
        </p>

        {/* Timestamp */}
        <p
          style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: "12px",
            margin: 0,
          }}
        >
          {formatTimeAgo(post.timestamp)}
        </p>
      </div>
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.10), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)",
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        paddingTop: "calc(var(--safe-area-top) + 12px)",
        paddingBottom: "calc(var(--bottom-nav-total-height) + 24px)",
        position: "relative",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      <style>{`
        .profile-posts-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-bottom: 0;
        }
        .profile-hero-card {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .profile-proof-stat-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .profile-proof-stat {
          align-items: center;
          border: 1px solid rgba(255,255,255,0.055);
          border-radius: 999px;
          display: flex;
          justify-content: center;
          min-height: 48px;
          min-width: 0;
          padding: 0 10px;
          text-align: center;
          white-space: nowrap;
        }
        .profile-proof-stat.is-primary {
          background: linear-gradient(135deg,#4ade80,#22c55e);
          border-color: rgba(255,255,255,0.08);
          box-shadow: 0 14px 30px rgba(74,222,128,0.2);
        }
        .profile-proof-stat:not(.is-primary) {
          background: rgba(255,255,255,0.045);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.045);
        }
        .profile-proof-stat-text {
          color: #d7ffe6;
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .profile-proof-stat.is-primary .profile-proof-stat-text {
          color: #061006;
        }
        @media (max-width: 480px) {
          .profile-posts-grid {
            gap: 18px;
          }
          .profile-hero-card {
            gap: 19px;
            padding: 24px 22px 26px !important;
            border-radius: 34px !important;
          }
          .profile-hero-card h2 {
            font-size: 25px !important;
          }
          .profile-proof-stat {
            min-height: 46px;
            padding: 0 8px;
          }
          .profile-proof-stat-text {
            font-size: 13px;
          }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes dailySweep {
          0% { transform: translateX(-120%); }
          42% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes dailyFloatIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in-up {
          animation: dailyFloatIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        .profile-daily-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
          animation: dailySweep 6.6s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>

      {/* Ambient background glow */}
      <div
        style={{
          position: "fixed",
          top: "-240px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "110%",
          height: "320px",
          background:
            "radial-gradient(ellipse 70% 32% at 50% 0%, rgba(74,222,128,0.09) 0%, transparent 100%)",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />

      {/* Profile Header — horizontal layout like reference */}
      <div
        className="animate-fade-in-up"
        style={{
          padding: "0 14px 12px",
          maxWidth: "430px",
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div>
            <h1
              style={{
                color: "#fff",
                fontSize: "18px",
                fontWeight: 850,
                lineHeight: 1.2,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {username.startsWith("@") ? username : `@${username}`}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowEditProfile(true);
            }}
            aria-label="Settings"
            style={{
              width: "42px",
              height: "42px",
              flexShrink: 0,
              borderRadius: "17px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.045)",
              color: "#cbd5e1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow:
                "0 14px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <Settings size={21} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div
        className="animate-fade-in-up"
        style={{
          padding: "0 12px 16px",
          position: "relative",
          zIndex: 1,
          maxWidth: "430px",
          margin: "0 auto",
        }}
      >
        <div
          className="profile-hero-card"
          style={{
            marginBottom: "28px",
            padding: "26px 22px 26px",
            borderRadius: "34px",
            border: "1px solid rgba(74,222,128,0.14)",
            background:
              "radial-gradient(circle at 18% -18%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 96% 12%, rgba(14,165,233,0.1), transparent 34%), linear-gradient(180deg, rgba(13,24,15,0.98), rgba(6,11,7,0.99))",
            boxShadow:
              "0 28px 70px rgba(0,0,0,0.48), 0 0 34px rgba(74,222,128,0.06), inset 0 1px 0 rgba(255,255,255,0.055)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Premium gradient accents */}
          <div
            style={{
              position: "absolute",
              inset: "0 0 auto 0",
              height: "1px",
              background:
                "linear-gradient(90deg, rgba(74,222,128,0), rgba(74,222,128,0.78), rgba(14,165,233,0.42), rgba(74,222,128,0))",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "-42px",
              top: "-54px",
              width: "180px",
              height: "180px",
              borderRadius: "999px",
              background: "rgba(74,222,128,0.08)",
              filter: "blur(38px)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "-64px",
              bottom: "-72px",
              width: "190px",
              height: "190px",
              borderRadius: "999px",
              background: "rgba(14,165,233,0.055)",
              filter: "blur(42px)",
              pointerEvents: "none",
            }}
          />

          {/* Instagram-style horizontal layout */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "20px",
              width: "100%",
              position: "relative",
              zIndex: 1,
              marginBottom: 0,
            }}
          >
            {/* Avatar - Left side */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div
                onClick={handleAvatarTap}
                onContextMenu={(event) => event.preventDefault()}
                style={{
                  padding: 0,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, #4ade80 0%, #38bdf8 100%)",
                  border: "none",
                  boxShadow:
                    "0 16px 34px rgba(0,0,0,0.36), 0 0 26px rgba(74,222,128,0.12)",
                  width: "70px",
                  height: "70px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  zIndex: 1,
                  cursor: "zoom-in",
                  touchAction: "manipulation",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    width: "70px",
                    height: "70px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Avatar
                    src={user?.avatar || ""}
                    alt={displayName || "User"}
                    size={74}
                    userId={user?.id}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAvatarUploadClick}
                disabled={isUploadingAvatar}
                aria-label="Change avatar"
                style={{
                  position: "absolute",
                  bottom: "-2px",
                  right: "-2px",
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4ade80, #22c55e)",
                  border: "3px solid #07100b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isUploadingAvatar ? "default" : "pointer",
                  color: "#000",
                  boxShadow: "0 4px 12px rgba(74,222,128,0.4)",
                  opacity: isUploadingAvatar ? 0.72 : 1,
                }}
              >
                {isUploadingAvatar ? (
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "999px",
                      border: "2px solid rgba(0,0,0,0.3)",
                      borderTopColor: "#000",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                ) : (
                  <Camera size={13} strokeWidth={2.6} />
                )}
              </button>
            </div>

            <div style={{ minWidth: 0, flex: 1, paddingTop: "6px" }}>
              <h2
                style={{
                  color: "#fff",
                  fontSize: "26px",
                  fontWeight: 950,
                  lineHeight: 1.05,
                  margin: "0 0 7px",
                  letterSpacing: "-0.035em",
                  textShadow: "0 8px 26px rgba(0,0,0,0.28)",
                }}
              >
                {displayName}
              </h2>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "13px",
                  fontWeight: 850,
                  lineHeight: 1,
                  margin: 0,
                }}
              >
                {username.startsWith("@") ? username : `@${username}`}
              </p>
            </div>
          </div>

          {/* Compact bio */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
            }}
          >
            <p
              style={{
                color: "#d7ffe6",
                fontSize: "14px",
                lineHeight: 1.45,
                margin: "0",
                maxWidth: "100%",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontWeight: 850,
                letterSpacing: "-0.01em",
              }}
            >
              {user?.bio?.trim() ||
                "Proof-first posts, real dares, close-friend stories."}
            </p>
          </div>

          <div
            className="profile-proof-stat-row"
            style={{ position: "relative", zIndex: 1 }}
          >
            {[
              {
                label: "Dares",
                value: profileStats.daresCompleted,
                primary: true,
                onClick: undefined,
              },
              {
                label: "Truths",
                value: profileTruthsCount,
                primary: false,
                onClick: undefined,
              },
              {
                label: "Friends",
                value: profileStats.friends,
                primary: false,
                onClick: handleFriendsClick,
              },
            ].map((stat) => (
              <button
                key={stat.label}
                type="button"
                onClick={stat.onClick}
                className={`profile-proof-stat ${stat.primary ? "is-primary" : ""}`}
                style={{
                  cursor: stat.onClick ? "pointer" : "default",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span className="profile-proof-stat-text">
                  {stat.value} {stat.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Subtle profile actions */}
        <div
          style={{
            margin: "-12px 16px 18px",
            padding: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto",
              gap: "8px",
            }}
          >
            <button
              type="button"
              onClick={() => setShowEditProfile(true)}
              style={{
                minHeight: "40px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.045)",
                color: "#d7ffe6",
                fontSize: "13px",
                fontWeight: 850,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(74,222,128,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.045)";
              }}
            >
              Edit profile
            </button>
            <button
              type="button"
              onClick={onNavigateToActivity}
              disabled={!onNavigateToActivity}
              style={{
                minHeight: "40px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.045)",
                color: "#d7ffe6",
                fontSize: "13px",
                fontWeight: 850,
                cursor: onNavigateToActivity ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: onNavigateToActivity ? 1 : 0.5,
                transition: "all 0.2s ease",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
              onMouseEnter={(e) => {
                if (onNavigateToActivity) {
                  e.currentTarget.style.background = "rgba(74,222,128,0.08)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.045)";
              }}
            >
              View activity
            </button>
            <button
              type="button"
              onClick={() => setIsGhostMode(!isGhostMode)}
              aria-label="Toggle ghost mode"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "999px",
                border: isGhostMode
                  ? "1px solid rgba(74,222,128,0.44)"
                  : "1px solid rgba(255,255,255,0.08)",
                background: isGhostMode
                  ? "rgba(74,222,128,0.16)"
                  : "rgba(255,255,255,0.045)",
                color: isGhostMode ? "#4ade80" : "#cbd5e1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: isGhostMode
                  ? "0 0 22px rgba(74,222,128,0.16), inset 0 1px 0 rgba(255,255,255,0.05)"
                  : "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
              onMouseEnter={(e) => {
                if (isGhostMode) {
                  e.currentTarget.style.background = "rgba(74,222,128,0.25)";
                } else {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                }
              }}
              onMouseLeave={(e) => {
                if (isGhostMode) {
                  e.currentTarget.style.background = "rgba(74,222,128,0.16)";
                } else {
                  e.currentTarget.style.background = "rgba(255,255,255,0.045)";
                }
              }}
            >
              <Shield size={17} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            background:
              "linear-gradient(180deg, rgba(5,19,18,0.72), rgba(4,10,9,0.9))",
            borderRadius: "999px",
            padding: "5px",
            margin: "0 16px 28px",
            border: "1px solid rgba(74,222,128,0.14)",
            boxShadow:
              "0 18px 48px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
            overflow: "hidden",
          }}
        >
          {(["posts", "truths", "dares"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 8px",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 900,
                textTransform: "capitalize",
                transition: "all 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
                background:
                  activeTab === tab
                    ? "linear-gradient(135deg, #4ade80, #22c55e)"
                    : "transparent",
                color: activeTab === tab ? "#061006" : "#94a3b8",
                boxShadow:
                  activeTab === tab
                    ? "0 4px 24px rgba(74,222,128,0.35), inset 0 1px 0 rgba(255,255,255,0.3)"
                    : "none",
                letterSpacing: 0,
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "posts" && (
          <div
            style={{
              padding: "0 16px",
              borderRadius: 0,
              border: "none",
              background: "transparent",
              boxShadow: "none",
            }}
          >
            {sortedPosts.length === 0 ? (
              <div
                style={{
                  minHeight: "300px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "40px 20px",
                }}
              >
                <div>
                  <Camera
                    size={48}
                    strokeWidth={1.5}
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      margin: "0 auto 16px",
                    }}
                  />
                  <p
                    style={{
                      color: "#fff",
                      fontSize: "22px",
                      fontWeight: 700,
                      margin: "0 0 8px",
                    }}
                  >
                    No Posts Yet
                  </p>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.5)",
                      fontSize: "14px",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    Share your first photo or video
                  </p>
                </div>
              </div>
            ) : (
              <div className="profile-posts-grid">
                {sortedPosts.map((post) => (
                  <div
                    key={post.id}
                    style={{
                      width: "100%",
                      aspectRatio: "1/1",
                      borderRadius: "28px",
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                      position: "relative",
                      transition: "all 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
                      background:
                        "linear-gradient(180deg, rgba(18,28,21,0.96), rgba(7,12,10,0.98))",
                      boxShadow:
                        "0 18px 44px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.045)",
                      WebkitUserSelect: "none",
                      userSelect: "none",
                      WebkitTapHighlightColor: "transparent",
                      touchAction: "manipulation",
                      zIndex: 1,
                    }}
                  >
                    <button
                      onClick={() => {
                        setShowPostsScreen(true);
                      }}
                      onMouseDown={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.style.opacity = "0.7";
                        }
                      }}
                      onMouseUp={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.style.opacity = "1";
                        }
                      }}
                      onMouseLeave={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.style.opacity = "1";
                        }
                      }}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        zIndex: 2,
                        padding: 0,
                        margin: 0,
                      }}
                    />
                    {post.media ? (
                      <img
                        src={post.media.url}
                        alt="Post"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "28px",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background:
                            "radial-gradient(circle at 25% 20%, rgba(74,222,128,0.16), transparent 44%), radial-gradient(circle at 80% 70%, rgba(56,189,248,0.12), transparent 42%), linear-gradient(135deg, rgba(14,24,18,0.98), rgba(5,8,6,0.98))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "12px",
                          textAlign: "center",
                          borderRadius: "28px",
                        }}
                      >
                        <p
                          style={{
                            color: "rgba(255,255,255,0.6)",
                            fontSize: "11px",
                            lineHeight: "1.4",
                            margin: 0,
                          }}
                        >
                          {post.content.slice(0, 40)}
                          {post.content.length > 40 ? "..." : ""}
                        </p>
                      </div>
                    )}
                    {/* Dark overlay with stats on each grid item */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.16) 46%, transparent 78%)",
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "space-between",
                        padding: "10px",
                        opacity: 0,
                        transition: "opacity 0.2s ease",
                        borderRadius: "28px",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "7px",
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          ♥ {Object.keys(post.likesByUser || {}).length}
                        </span>
                        <span
                          style={{
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          💬 {post.comments_count || 0}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "flex-end",
                        padding: "0 24px 14px",
                        borderRadius: "28px",
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.14) 44%, transparent 76%)",
                        pointerEvents: "none",
                      }}
                    >
                      <div style={{ width: "100%" }}>
                        <div
                          style={{
                            height: "1px",
                            width: "100%",
                            background:
                              "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04))",
                            marginBottom: "10px",
                          }}
                        />
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            color: "#8da3b6",
                            fontSize: "11px",
                            fontWeight: 950,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            textShadow: "0 2px 8px rgba(0,0,0,0.45)",
                          }}
                        >
                          {post.media?.type === "video"
                            ? `Views ${post.stats?.views ?? 0}`
                            : `Likes ${Object.keys(post.likesByUser || {}).length}`}
                        </span>
                      </div>
                    </div>

                    {post.media && post.media.type === "video" && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "0",
                          left: "0",
                          right: "0",
                          background:
                            "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                          padding: "10px",
                          display: "flex",
                          alignItems: "center",
                          borderRadius: "0 0 28px 28px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          <Play size={10} color="#fff" strokeWidth={2} />
                          <span
                            style={{
                              color: "#fff",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            {post.stats.views}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "truths" && (
          <div
            style={{
              padding: "20px",
              borderRadius: "34px",
              border: "1px solid rgba(255,255,255,0.08)",
              background:
                "linear-gradient(180deg, rgba(16,20,17,0.96), rgba(7,9,8,0.98))",
              boxShadow:
                "0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {loadingTruth ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "72px 20px",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    border: "3px solid rgba(96,165,250,0.15)",
                    borderTopColor: "#60a5fa",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    willChange: "transform",
                    transformStyle: "preserve-3d",
                  }}
                />
                <span
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Loading truths...
                </span>
              </div>
            ) : userTruthPosts.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center" }}>
                <MessageSquare
                  size={36}
                  color="rgba(255,255,255,0.12)"
                  style={{ margin: "0 auto 14px" }}
                />
                <p
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "15px",
                    fontWeight: 600,
                    margin: "0 0 4px",
                  }}
                >
                  No truths yet
                </p>
                <p
                  style={{
                    color: "rgba(255,255,255,0.2)",
                    fontSize: "13px",
                    margin: 0,
                  }}
                >
                  Truths you take part in will appear here
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "22px",
                }}
              >
                {userTruthPosts.map((truth, index) => {
                  const badge =
                    truth.state === "APPROVED"
                      ? { label: "Approved", color: "#4ade80" }
                      : truth.state === "ANSWERED"
                        ? { label: "Answered", color: "#22c55e" }
                        : truth.state === "REJECTED"
                          ? { label: "Rejected", color: "#ef4444" }
                          : truth.state === "UNDER_REVIEW"
                            ? { label: "Under Review", color: "#fbbf24" }
                            : {
                                label: "Pending",
                                color: "rgba(255,255,255,0.4)",
                              };
                  return (
                    <div
                      key={truth.id}
                      onClick={() => {
                        setInitialTruthId(truth.id);
                        setShowTruthsListScreen(true);
                      }}
                      style={{
                        animationDelay: `${index * 0.04}s`,
                        width: "100%",
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderLeft: `3px solid ${badge.color}`,
                        borderRadius: "20px",
                        padding: "24px 28px",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "18px",
                        boxShadow:
                          "0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.28)",
                        transition:
                          "border-color 0.2s ease, transform 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      {/* Accent dot */}
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: badge.color,
                          boxShadow: `0 0 14px ${badge.color}90`,
                          flexShrink: 0,
                          marginTop: "7px",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            margin: 0,
                            fontSize: "14px",
                            fontWeight: 600,
                            lineHeight: 1.3,
                            color: "rgba(255,255,255,0.55)",
                            letterSpacing: "-0.005em",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToProfile && truth.challengerId) {
                                onNavigateToProfile(truth.challengerId);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: onNavigateToProfile
                                ? "pointer"
                                : "default",
                              textDecoration: "none",
                            }}
                          >
                            <img
                              src={truth.challenger.avatar}
                              alt=""
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.2)",
                              }}
                            />
                            <span
                              style={{
                                color: "rgba(255,255,255,0.9)",
                                fontSize: "14px",
                                fontWeight: 600,
                              }}
                            >
                              {truth.challenger.nickname}
                            </span>
                          </button>
                          <span
                            style={{
                              margin: "0 6px",
                              color: "rgba(255,255,255,0.35)",
                              fontWeight: 500,
                            }}
                          >
                            asked
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToProfile && truth.receiverId) {
                                onNavigateToProfile(truth.receiverId);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: onNavigateToProfile
                                ? "pointer"
                                : "default",
                              textDecoration: "none",
                            }}
                          >
                            <img
                              src={truth.receiver.avatar}
                              alt=""
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.2)",
                              }}
                            />
                            <span
                              style={{
                                color: "rgba(255,255,255,0.9)",
                                fontSize: "14px",
                                fontWeight: 600,
                              }}
                            >
                              {truth.receiver.nickname}
                            </span>
                          </button>
                        </div>
                        {truth.question && (
                          <p
                            style={{
                              margin: "8px 0 0",
                              fontSize: "19px",
                              fontWeight: 700,
                              lineHeight: 1.35,
                              letterSpacing: "-0.02em",
                              color: "#fff",
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {truth.question}
                          </p>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            marginTop: "13px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: badge.color,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              padding: "5px 12px",
                              borderRadius: "99px",
                              background: `${badge.color}18`,
                              border: `1px solid ${badge.color}40`,
                            }}
                          >
                            {badge.label}
                          </span>
                          <span
                            style={{
                              color: "rgba(255,255,255,0.4)",
                              fontSize: "13px",
                              fontWeight: 500,
                            }}
                          >
                            {formatTimeAgo(truth.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "dares" && (
          <div
            style={{
              padding: "20px",
              borderRadius: "34px",
              border: "1px solid rgba(255,255,255,0.08)",
              background:
                "linear-gradient(180deg, rgba(16,20,17,0.96), rgba(7,9,8,0.98))",
              boxShadow:
                "0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {loadingDares ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "72px 20px",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    border: "3px solid rgba(74, 222, 128, 0.15)",
                    borderTopColor: "#4ade80",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    willChange: "transform",
                    transformStyle: "preserve-3d",
                  }}
                />
                <span
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Loading dares...
                </span>
              </div>
            ) : userDarePosts.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center" }}>
                <Target
                  size={36}
                  color="rgba(255,255,255,0.12)"
                  style={{ margin: "0 auto 14px" }}
                />
                <p
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "15px",
                    fontWeight: 600,
                    margin: "0 0 4px",
                  }}
                >
                  No dares yet
                </p>
                <p
                  style={{
                    color: "rgba(255,255,255,0.2)",
                    fontSize: "13px",
                    margin: 0,
                  }}
                >
                  Dares you take part in will appear here
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "22px",
                }}
              >
                {userDarePosts.map((dare, index) => {
                  const badge =
                    dare.state === "ACCEPTED_REAL"
                      ? { label: "Completed", color: "#4ade80" }
                      : dare.state === "CHICKEN_OUT"
                        ? { label: "Surrendered", color: "#fbbf24" }
                        : dare.state === "REJECTED_FAKE"
                          ? { label: "Rejected", color: "#ef4444" }
                          : dare.state === "PROOF_SUBMITTED" ||
                              dare.state === "UNDER_REVIEW" ||
                              dare.state === "FRIENDS_VALIDATION"
                            ? { label: "Under Review", color: "#fbbf24" }
                            : dare.state === "ACCEPTED"
                              ? { label: "Accepted", color: "#22c55e" }
                              : {
                                  label: "Pending",
                                  color: "rgba(255,255,255,0.4)",
                                };
                  return (
                    <div
                      key={dare.id}
                      onClick={() => {
                        setInitialDareId(dare.id);
                        setShowDaresListScreen(true);
                      }}
                      style={{
                        animationDelay: `${index * 0.04}s`,
                        width: "100%",
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderLeft: `3px solid ${badge.color}`,
                        borderRadius: "20px",
                        padding: "24px 28px",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "18px",
                        boxShadow:
                          "0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.28)",
                        transition:
                          "border-color 0.2s ease, transform 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      {/* Accent dot */}
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: badge.color,
                          boxShadow: `0 0 14px ${badge.color}90`,
                          flexShrink: 0,
                          marginTop: "7px",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            margin: 0,
                            fontSize: "14px",
                            fontWeight: 600,
                            lineHeight: 1.3,
                            color: "rgba(255,255,255,0.55)",
                            letterSpacing: "-0.005em",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToProfile && dare.challengerId) {
                                onNavigateToProfile(dare.challengerId);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: onNavigateToProfile
                                ? "pointer"
                                : "default",
                              textDecoration: "none",
                            }}
                          >
                            <img
                              src={dare.challenger.avatar}
                              alt=""
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.2)",
                              }}
                            />
                            <span
                              style={{
                                color: "rgba(255,255,255,0.9)",
                                fontSize: "14px",
                                fontWeight: 600,
                              }}
                            >
                              {dare.challenger.nickname}
                            </span>
                          </button>
                          <span
                            style={{
                              margin: "0 6px",
                              color: "rgba(255,255,255,0.35)",
                              fontWeight: 500,
                            }}
                          >
                            dared
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToProfile && dare.receiverId) {
                                onNavigateToProfile(dare.receiverId);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: onNavigateToProfile
                                ? "pointer"
                                : "default",
                              textDecoration: "none",
                            }}
                          >
                            <img
                              src={dare.receiver.avatar}
                              alt=""
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.2)",
                              }}
                            />
                            <span
                              style={{
                                color: "rgba(255,255,255,0.9)",
                                fontSize: "14px",
                                fontWeight: 600,
                              }}
                            >
                              {dare.receiver.nickname}
                            </span>
                          </button>
                        </div>
                        {dare.description && (
                          <p
                            style={{
                              margin: "8px 0 0",
                              fontSize: "19px",
                              fontWeight: 700,
                              lineHeight: 1.35,
                              letterSpacing: "-0.02em",
                              color: "#fff",
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {dare.description}
                          </p>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            marginTop: "13px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: badge.color,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              padding: "5px 12px",
                              borderRadius: "99px",
                              background: `${badge.color}18`,
                              border: `1px solid ${badge.color}40`,
                            }}
                          >
                            {badge.label}
                          </span>
                          <span
                            style={{
                              color: "rgba(255,255,255,0.4)",
                              fontSize: "13px",
                              fontWeight: 500,
                            }}
                          >
                            {formatTimeAgo(dare.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Logout button */}
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "12px",
            borderRadius: "0",
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.25)",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 500,
            marginTop: "8px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.25)";
          }}
        >
          <LogOut size={14} />
          <span>Logout</span>
        </button>
      </div>

      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileSelect}
        style={{ display: "none" }}
      />

      {showAvatarPreview && (
        <div
          className="app-modal-backdrop"
          onClick={() => setShowAvatarPreview(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1600,
            background:
              "radial-gradient(circle at 50% 20%, rgba(74,222,128,0.12), transparent 34%), rgba(0,0,0,0.92)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px",
            cursor: "zoom-out",
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowAvatarPreview(false);
            }}
            style={{
              position: "absolute",
              top: "calc(18px + var(--safe-area-top))",
              right: "18px",
              width: "42px",
              height: "42px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.07)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 14px 34px rgba(0,0,0,0.36)",
            }}
            aria-label="Close avatar preview"
          >
            <X size={20} />
          </button>
          <div
            className="app-modal-dialog"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(76vw, 380px)",
              height: "min(76vw, 380px)",
              maxHeight: "72vh",
              maxWidth: "72vh",
              borderRadius: "50%",
              padding: "4px",
              background:
                "linear-gradient(135deg, rgba(74,222,128,0.95), rgba(255,255,255,0.22) 44%, rgba(96,165,250,0.42))",
              boxShadow:
                "0 30px 100px rgba(0,0,0,0.58), 0 0 60px rgba(74,222,128,0.14), inset 0 1px 0 rgba(255,255,255,0.2)",
              position: "relative",
            }}
          >
            <img
              src={avatarPreviewSrc}
              alt={`${displayName}'s avatar`}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                objectFit: "cover",
                display: "block",
                background: "#111611",
              }}
            />
            <button
              type="button"
              onClick={handleAvatarUploadClick}
              disabled={isUploadingAvatar}
              aria-label="Change avatar"
              style={{
                position: "absolute",
                right: "10px",
                bottom: "10px",
                width: "48px",
                height: "48px",
                borderRadius: "999px",
                border: "3px solid #080d08",
                background: "#4ade80",
                color: "#061006",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isUploadingAvatar ? "default" : "pointer",
                boxShadow:
                  "0 16px 32px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.16)",
                opacity: isUploadingAvatar ? 0.78 : 1,
              }}
            >
              {isUploadingAvatar ? (
                <span
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    border: "2px solid rgba(6,16,6,0.32)",
                    borderTopColor: "#061006",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              ) : (
                <Camera size={21} />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Show ProfileEditScreen if settings is clicked */}
      {showEditProfile && (
        <div
          className="app-story-shell"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            backgroundColor: "#0a0f0a",
          }}
        >
          <ProfileEditScreen
            onBack={() => {
              setShowEditProfile(false);
            }}
          />
        </div>
      )}

      {showFriendsScreen && (
        <div
          className="app-story-shell"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - Reduce zIndex to prevent blocking */
            /* DISABLED: zIndex: 9999, */
            zIndex: 1000,
            backgroundColor: "#0a0a0a",
          }}
        >
          <FriendsScreen
            onBack={() => setShowFriendsScreen(false)}
            onNavigateToProfile={onNavigateToProfile}
          />
        </div>
      )}
    </div>
  );
}
