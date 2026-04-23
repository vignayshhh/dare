"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Star, Users } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { friendsService } from "../../middleware/services/service-factory";
import { closeFriendsService } from "../../middleware/services/service-factory";
import { useAuthStore } from "../../stores/useAuthStore-v2";

interface FriendsScreenProps {
  onBack: () => void;
  onNavigateToProfile?: (userId: string) => void;
}

export function FriendsScreen({ onBack, onNavigateToProfile }: FriendsScreenProps) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"friends" | "close-friends">("friends");
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [closeFriendsList, setCloseFriendsList] = useState<any[]>([]);
  const [loadingCloseFriends, setLoadingCloseFriends] = useState(false);

  // Load friends when component mounts
  useEffect(() => {
    if (!user?.id) return;

    const loadFriends = async () => {
      setLoadingFriends(true);
      try {
        const response = await friendsService.getFriends(user.id);
        if (response.success && response.friends) {
          console.log("🔍 Raw friends from service:", response.friends.map((f: any) => ({
            id: f?.id,
            userId: f?.userId,
            username: f?.username,
            displayName: f?.displayName
          })));
          
          // Deduplicate friends based on userId/id, with username as fallback
          const uniqueFriendsMap = new Map<string, any>();
          
          for (const friend of response.friends) {
            const key = friend?.userId || friend?.id || friend?.username;
            if (key && !uniqueFriendsMap.has(key)) {
              uniqueFriendsMap.set(key, friend);
            } else if (key) {
              console.log("⚠️ Duplicate friend detected:", key, friend);
            }
          }
          
          const uniqueFriends = Array.from(uniqueFriendsMap.values());
          console.log("✅ Deduplicated friends count:", uniqueFriends.length, "from", response.friends.length);
          
          setFriendsList(uniqueFriends);
        } else {
          setFriendsList([]);
        }
      } catch (error) {
        console.error("Error loading friends:", error);
        setFriendsList([]);
      } finally {
        setLoadingFriends(false);
      }
    };

    loadFriends();
  }, [user?.id]);

  // Load close friends when component mounts
  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;

    const loadCloseFriends = async () => {
      setLoadingCloseFriends(true);
      try {
        const response = await closeFriendsService.getCloseFriends(user.id);
        if (!isMounted) return;
        setCloseFriendsList(response.success ? response.friends || [] : []);
      } catch (error) {
        console.error("Error loading close friends:", error);
        if (isMounted) {
          setCloseFriendsList([]);
        }
      } finally {
        if (isMounted) {
          setLoadingCloseFriends(false);
        }
      }
    };

    loadCloseFriends();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        paddingBottom: "20px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(10, 10, 10, 0.95)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          onClick={onBack}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "none",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <h1
          style={{
            color: "#fff",
            fontSize: "18px",
            fontWeight: 700,
            margin: 0,
          }}
        >
          {activeTab === "friends" ? "Friends" : "Close Friends"}
        </h1>
        <div style={{ width: "36px" }} />
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          padding: "12px 20px",
          gap: "8px",
          background: "rgba(10, 10, 10, 0.95)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          position: "sticky",
          top: "69px",
          zIndex: 9,
        }}
      >
        <button
          onClick={() => setActiveTab("friends")}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: "14px",
            border: "none",
            background: activeTab === "friends"
              ? "rgba(74,222,128,0.15)"
              : "rgba(255,255,255,0.04)",
            color: activeTab === "friends" ? "#4ade80" : "rgba(255,255,255,0.6)",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s",
          }}
        >
          <Users size={16} />
          Friends ({friendsList.length})
        </button>
        <button
          onClick={() => setActiveTab("close-friends")}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: "14px",
            border: "none",
            background: activeTab === "close-friends"
              ? "rgba(250,204,21,0.15)"
              : "rgba(255,255,255,0.04)",
            color: activeTab === "close-friends" ? "#facc15" : "rgba(255,255,255,0.6)",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s",
          }}
        >
          <Star size={16} />
          Close Friends ({closeFriendsList.length})
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 20px" }}>
        {activeTab === "friends" ? (
          <>
            {loadingFriends ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 14,
                }}
              >
                Loading friends...
              </div>
            ) : friendsList.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 14,
                }}
              >
                No friends yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {friendsList.map((friend, i) => (
                  <div
                    key={`friend-${friend.id || friend.userId}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 16px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.03)",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onClick={() => {
                      if (onNavigateToProfile && (friend.userId || friend.id)) {
                        onNavigateToProfile(friend.userId || friend.id);
                      }
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      <Avatar
                        src={friend.avatarUrl || friend.avatar_url || ""}
                        alt={
                          friend.displayName ||
                          friend.nickname ||
                          friend.display_name ||
                          friend.username
                        }
                        size="lg"
                        userId={friend.userId || friend.id}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 15,
                          margin: 0,
                        }}
                      >
                        {friend.displayName ||
                          friend.nickname ||
                          friend.display_name ||
                          friend.username}
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: 13,
                          margin: "2px 0 0",
                        }}
                      >
                        @{String(friend.username || "unknown").replace(/^@/, "")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {loadingCloseFriends ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 14,
                }}
              >
                Loading close friends...
              </div>
            ) : closeFriendsList.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                Add trusted friends from their profile to see them here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {closeFriendsList.map((friend) => (
                  <div
                    key={friend.userId || friend.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      borderRadius: "16px",
                      background: "rgba(250,204,21,0.05)",
                      border: "1px solid rgba(250,204,21,0.1)",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onClick={() => {
                      if (onNavigateToProfile && friend.userId) {
                        onNavigateToProfile(friend.userId);
                      }
                    }}
                  >
                    <Avatar
                      src={friend.avatarUrl || ""}
                      alt={friend.displayName || friend.username}
                      size="md"
                      userId={friend.userId}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 15,
                          margin: 0,
                        }}
                      >
                        {friend.displayName || friend.username}
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: 12,
                          margin: "2px 0 0",
                        }}
                      >
                        @{String(friend.username || "unknown").replace(/^@/, "")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
