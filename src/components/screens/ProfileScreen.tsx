"use client";

import { useState, useEffect } from "react";
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
import { useContentStore } from "../../stores/useContentStore";
import { friendsService } from "../../middleware/services/service-factory";
import { closeFriendsService } from "../../middleware/services/service-factory";
import { formatTimeAgo } from "../../utils/timeFormat";
import { TruthsListScreen } from "./TruthsListScreen";
import { DaresListScreen } from "./DaresListScreen";
import type {
  TruthPost,
  DarePost,
} from "../../middleware/adapters/data-adapters";

interface ProfileStats {
  daresCompleted: number;
  daresSurrendered: number;
  friends: number;
}

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
  const { user, signOut, subscribe } = useAuthStore();
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
  const [showFriendsScreen, setShowFriendsScreen] = useState(false);
  const [showTruthsListScreen, setShowTruthsListScreen] = useState(false);
  const [showDaresListScreen, setShowDaresListScreen] = useState(false);
  const [initialTruthId, setInitialTruthId] = useState<string | undefined>(
    undefined,
  );
  const [initialDareId, setInitialDareId] = useState<string | undefined>(
    undefined,
  );

  const {
    truthPosts,
    darePosts,
    loadingTruth,
    loadingDares,
    loadTruthPosts,
    loadDarePosts,
  } = useContentStore();

  // Handle logout
  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      await signOut();
      // The app should automatically redirect to auth screen due to isAuthenticated change
    } catch (error) {
      console.error("❌ LOGOUT ERROR:", error);
    } finally {
      setIsLoggingOut(false);
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

  // Load truth/dare posts when those tabs are activated
  useEffect(() => {
    if (!isActive) return;
    if (activeTab === "truths" && truthPosts.length === 0 && !loadingTruth) {
      loadTruthPosts();
    }
    if (activeTab === "dares" && darePosts.length === 0 && !loadingDares) {
      loadDarePosts();
    }
  }, [
    activeTab,
    isActive,
    truthPosts.length,
    darePosts.length,
    loadingTruth,
    loadingDares,
    loadTruthPosts,
    loadDarePosts,
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

  const allUserDares = [...sentDares, ...receivedDares];
  const completedDaresCount = allUserDares.filter(
    (dare) => dare.state === "ACCEPTED_REAL",
  ).length;
  const surrenderedDaresCount = allUserDares.filter(
    (dare) => dare.state === "CHICKEN_OUT",
  ).length;

  // In production mode, profile stats come from backend
  // Start with empty stats - will be populated by real data
  const profileStats: ProfileStats = {
    daresCompleted:
      completedDaresCount > 0
        ? completedDaresCount
        : toSafeCount(
            (profile as any)?.daresCompleted ??
              (profile as any)?.dares_completed,
          ),
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
        truthPosts={truthPosts}
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
        darePosts={darePosts}
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
                        display: "flex",
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
        background: "#000",
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        paddingBottom: "100px",
        position: "relative",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      <style>{`
        .profile-posts-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 3px;
          margin-bottom: 12px;
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
        .animate-fade-in-up {
          animation: fadeInUp 0.6s cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
      `}</style>

      {/* Ambient background glow */}
      <div
        style={{
          position: "fixed",
          top: "-200px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          height: "400px",
          background:
            "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(74,222,128,0.15) 0%, transparent 100%)",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />

      {/* Top Nav */}
      <div
        className="animate-fade-in-up"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px 14px",
          position: "relative",
          zIndex: 1,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          background: "rgba(0,0,0,0.3)",
        }}
      >
        <h1
          style={{
            color: "#fff",
            fontSize: "22px",
            fontWeight: 800,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          DARE
        </h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setIsGhostMode(!isGhostMode)}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: isGhostMode
                ? "1.5px solid rgba(74,222,128,0.4)"
                : "1px solid rgba(255,255,255,0.08)",
              background: isGhostMode
                ? "rgba(74,222,128,0.15)"
                : "rgba(255,255,255,0.04)",
              color: isGhostMode ? "#4ade80" : "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
              boxShadow: isGhostMode ? "0 0 20px rgba(74,222,128,0.2)" : "none",
            }}
          >
            <Shield size={16} strokeWidth={2} />
          </button>

          <button
            onClick={() => {
              setShowEditProfile(true);
            }}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
              zIndex: 100,
              transition: "all 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(74,222,128,0.3)";
              e.currentTarget.style.background = "rgba(74,222,128,0.1)";
              e.currentTarget.style.color = "#4ade80";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              e.currentTarget.style.color = "rgba(255,255,255,0.5)";
            }}
          >
            <Settings size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Profile Header — horizontal layout like reference */}
      <div
        className="animate-fade-in-up"
        style={{
          padding: "24px 20px 16px",
          position: "relative",
          zIndex: 1,
          maxWidth: "920px",
          margin: "0 auto",
        }}
      >
        {/* Gradient banner behind avatar area */}
        <div
          style={{
            position: "absolute",
            top: "-24px",
            left: "-20px",
            right: "-20px",
            height: "350px",
            background:
              "radial-gradient(ellipse 120% 60% at 50% 0%, rgba(74,222,128,0.18) 0%, transparent 80%)",
            pointerEvents: "none",
            zIndex: -1,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "20px",
            marginBottom: "18px",
          }}
        >
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                padding: "3px",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #4ade80, #22c55e, #4ade80)",
                boxShadow: "0 0 20px rgba(74,222,128,0.25)",
                width: "88px",
                height: "88px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Avatar
                src={user?.avatar || ""}
                alt={displayName || "User"}
                size="xl"
                userId={user?.id}
              />
            </div>
            <button
              style={{
                position: "absolute",
                bottom: "0px",
                right: "0px",
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                background: "#1a1a1a",
                border: "2px solid #000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#fff",
              }}
            >
              <Camera size={13} />
            </button>
            {onNavigateToActivity && (
              <button
                onClick={onNavigateToActivity}
                style={{
                  position: "absolute",
                  bottom: "0px",
                  left: "-8px",
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  background: "#4ade80",
                  border: "2px solid #000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#000",
                }}
              >
                <Activity size={13} />
              </button>
            )}
          </div>

          {/* Name + username + bio */}
          <div style={{ flex: 1, minWidth: 0, paddingTop: "4px" }}>
            <h2
              style={{
                color: "#fff",
                fontSize: "28px",
                fontWeight: 800,
                lineHeight: 1.1,
                margin: "0 0 4px",
              }}
            >
              {displayName}
            </h2>
            <p
              style={{
                color: "rgba(74,222,128,0.7)",
                fontSize: "15px",
                margin: "0 0 10px",
              }}
            >
              {username.startsWith("@") ? username : `@${username}`}
            </p>
            {user?.bio && (
              <p
                style={{
                  color: "rgba(255,255,255,0.68)",
                  fontSize: "14px",
                  lineHeight: 1.55,
                  margin: 0,
                  maxWidth: "560px",
                }}
              >
                {user.bio}
              </p>
            )}
          </div>
        </div>

        {/* Stats — horizontal scrolling pill row */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            overflowX: "auto",
            paddingBottom: "6px",
            WebkitOverflowScrolling: "touch",
            marginBottom: "0px",
          }}
        >
          {[
            {
              label: "Friends",
              value: profileStats.friends,
              onClick: handleFriendsClick,
            },
            {
              label: "Completed",
              value: profileStats.daresCompleted,
              onClick: undefined,
            },
            {
              label: "Surrendered",
              value: profileStats.daresSurrendered,
              onClick: undefined,
            },
          ].map(({ label, value, onClick }, index) => (
            <div
              key={label}
              onClick={onClick}
              style={{
                flexShrink: 0,
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                border: "none",
                borderRadius: "999px",
                padding: "12px 24px",
                textAlign: "center",
                cursor: onClick ? "pointer" : "default",
                transition: "all 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
                boxShadow:
                  "0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
              onMouseEnter={(e) => {
                if (onClick) {
                  e.currentTarget.style.borderColor = "rgba(74,222,128,0.4)";
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(74,222,128,0.12) 0%, rgba(74,222,128,0.04) 100%)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }
              }}
              onMouseLeave={(e) => {
                if (onClick) {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)";
                  e.currentTarget.style.transform = "translateY(0)";
                }
              }}
            >
              <p
                style={{
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "22px",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                {value}
              </p>
              <p
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: "11px",
                  margin: 0,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Tab Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "999px",
            padding: "5px",
            marginTop: "30px",
            marginBottom: "20px",
            border: "none",
            boxShadow:
              "0 2px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
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
                fontWeight: 800,
                textTransform: "capitalize",
                transition: "all 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
                background:
                  activeTab === tab
                    ? "linear-gradient(135deg, #4ade80, #22c55e)"
                    : "transparent",
                color: activeTab === tab ? "#000" : "rgba(255,255,255,0.4)",
                boxShadow:
                  activeTab === tab
                    ? "0 4px 24px rgba(74,222,128,0.35), inset 0 1px 0 rgba(255,255,255,0.3)"
                    : "none",
                letterSpacing: "0.02em",
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "posts" && (
          <div>
            {/* 3x3 Grid for Posts */}
            <div className="profile-posts-grid">
              {sortedPosts.slice(0, 9).map((post) => (
                <div
                  key={post.id}
                  style={{
                    width: "100%",
                    aspectRatio: "5/6",
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "border 0.15s ease, transform 0.15s ease",
                    backdropFilter: "blur(10px)",
                    background: "rgba(255,255,255,0.03)",
                    WebkitUserSelect: "none",
                    userSelect: "none",
                    WebkitTapHighlightColor: "transparent",
                    touchAction: "manipulation",
                    pointerEvents: "auto",
                    zIndex: 1,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                >
                  {/* Invisible button overlay for clicks */}
                  <button
                    onClick={() => {
                      setShowPostsScreen(true);
                    }}
                    onMouseDown={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.style.borderColor = "rgba(74,222,128,0.7)";
                        parent.style.transform = "scale(0.98)";
                      }
                    }}
                    onMouseUp={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.style.borderColor = "rgba(255,255,255,0.08)";
                        parent.style.transform = "scale(1)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.style.borderColor = "rgba(255,255,255,0.08)";
                        parent.style.transform = "scale(1)";
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
                        borderRadius: "12px",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background:
                          "linear-gradient(135deg, rgba(74,222,128,0.1), rgba(34,197,94,0.05))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "8px",
                        textAlign: "center",
                        borderRadius: "12px",
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
                        "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)",
                      display: "flex",
                      alignItems: "flex-end",
                      padding: "8px",
                      opacity: 0,
                      transition: "opacity 0.2s ease",
                      borderRadius: "12px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "0";
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px" }}>
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
                        borderRadius: "0 0 12px 12px",
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
          </div>
        )}

        {activeTab === "truths" && (
          <div style={{ padding: "10px 16px 24px" }}>
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
            ) : truthPosts.length === 0 ? (
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
                  Truths will appear here
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
                {truthPosts.map((truth, index) => {
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
          <div style={{ padding: "10px 16px 24px" }}>
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
            ) : darePosts.length === 0 ? (
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
                  Dares will appear here
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
                {darePosts.map((dare, index) => {
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

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
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
            color: isLoggingOut
              ? "rgba(239,68,68,0.5)"
              : "rgba(255,255,255,0.25)",
            cursor: isLoggingOut ? "not-allowed" : "pointer",
            fontSize: "13px",
            fontWeight: 500,
            marginTop: "8px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!isLoggingOut) {
              (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.25)";
          }}
        >
          <LogOut size={14} />
          <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>
        </button>
      </div>

      {/* Show ProfileEditScreen if settings is clicked */}
      {showEditProfile && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
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
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
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
