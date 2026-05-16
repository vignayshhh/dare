"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, MessageCircle, Search, X } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import {
  chatInviteService,
  type ChatInvite,
} from "../../middleware/services/chat-invite.service";
import { useAuthStore } from "../../stores/useAuthStore-v2";

export function FriendsInviteAlertsScreen({
  onBack,
  onOpenConversation,
}: {
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const { user } = useAuthStore();
  const [invites, setInvites] = useState<ChatInvite[]>([]);
  const [search, setSearch] = useState("");
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    return chatInviteService.subscribeReceivedInvites(user.id, setInvites);
  }, [user?.id]);

  const visibleInvites = useMemo(
    () =>
      invites.filter((invite) =>
        ["pending", "accepted"].includes(invite.status),
      ),
    [invites],
  );

  const filteredInvites = visibleInvites.filter((invite) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [invite.inviter_name, invite.invitee_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  const respond = async (invite: ChatInvite, response: "accept" | "reject") => {
    if (!user?.id || busyInviteId) return;
    setBusyInviteId(invite.id);
    try {
      if (response === "accept") {
        await chatInviteService.acceptInvite(invite.id, user.id);
      } else {
        await chatInviteService.rejectInvite(invite.id, user.id);
      }
    } catch (error) {
      console.error("Unable to respond to chat invite:", error);
      alert("Unable to update invite.");
    } finally {
      setBusyInviteId(null);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#000",
        color: "#fff",
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        paddingBottom: "calc(20px + var(--safe-area-bottom))",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          padding: "calc(14px + var(--safe-area-top)) 16px 12px",
          background: "rgba(0,0,0,0.92)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Invite alerts</div>
            <div
              style={{
                color: "rgba(255,255,255,0.42)",
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              Temporary chat access
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            height: 48,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 14px",
            borderRadius: 18,
            background: "#111",
            border: "1px solid #202020",
          }}
        >
          <Search size={17} color="#555" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invites"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "#fff",
              fontSize: 15,
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {filteredInvites.length === 0 ? (
          <div
            style={{
              padding: "56px 16px",
              textAlign: "center",
              color: "rgba(255,255,255,0.42)",
            }}
          >
            <MessageCircle size={44} style={{ margin: "0 auto 14px" }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              No friend invites
            </div>
          </div>
        ) : (
          filteredInvites.map((invite) => {
            const pending = invite.status === "pending";
            return (
              <div
                key={invite.id}
                style={{
                  background: "#111",
                  border: "1px solid #1f1f1f",
                  borderRadius: 20,
                  padding: 14,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Avatar alt={invite.inviter_name} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 850,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {invite.inviter_name || "Someone"}
                  </div>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.45)",
                      fontSize: 13,
                      marginTop: 3,
                      lineHeight: 1.35,
                    }}
                  >
                    {pending
                      ? "invited you into their chat"
                      : "temporary chat is open"}
                  </div>
                </div>

                {pending ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      aria-label="Reject invite"
                      onClick={() => void respond(invite, "reject")}
                      disabled={busyInviteId === invite.id}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.06)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <X size={16} />
                    </button>
                    <button
                      aria-label="Accept invite"
                      onClick={() => void respond(invite, "accept")}
                      disabled={busyInviteId === invite.id}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        border: "none",
                        background: "#3df57f",
                        color: "#000",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={17} strokeWidth={3} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onOpenConversation(invite.conversation_id)}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "10px 13px",
                      background: "#3df57f",
                      color: "#000",
                      fontSize: 13,
                      fontWeight: 900,
                      fontFamily: "inherit",
                    }}
                  >
                    Enter
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
