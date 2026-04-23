"use client";

import { useEffect, useState } from "react";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";

export function RealTimeMessagingExample() {
  const { user } = useAuthStore();
  const {
    conversations,
    messages,
    onlineFriends,
    loading,
    sendingMessage,
    subscribeToRealTimeConversations,
    unsubscribeFromRealTimeConversations,
    subscribeToRealTimeMessages,
    unsubscribeFromRealTimeMessages,
    subscribeToOnlineStatus,
    unsubscribeFromOnlineStatus,
    sendRealTimeMessage,
    markMessageAsSeen,
    setTypingIndicator,
    setOnlineStatus,
  } = useMessagingStore();

  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [messageInput, setMessageInput] = useState("");

  // Initialize real-time subscriptions when user is available
  useEffect(() => {
    if (user?.id) {
      console.log("🚀 Initializing real-time messaging for user:", user.id);

      // Subscribe to real-time conversations
      subscribeToRealTimeConversations(user.id);

      // Subscribe to online status of friends
      subscribeToOnlineStatus(user.id);

      // Set user as online
      setOnlineStatus(true);

      // Cleanup on unmount
      return () => {
        console.log("🧹 Cleaning up real-time subscriptions");
        unsubscribeFromRealTimeConversations();
        unsubscribeFromRealTimeMessages();
        unsubscribeFromOnlineStatus();
        setOnlineStatus(false);
      };
    }
  }, [user?.id]);

  // Subscribe to messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      console.log(
        "🔄 Subscribing to messages for conversation:",
        selectedConversation,
      );
      subscribeToRealTimeMessages(selectedConversation);

      return () => {
        unsubscribeFromRealTimeMessages();
      };
    }
  }, [selectedConversation]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;

    await sendRealTimeMessage(selectedConversation, messageInput.trim());
    setMessageInput("");
  };

  const handleTyping = (isTyping: boolean) => {
    if (selectedConversation) {
      setTypingIndicator(selectedConversation, isTyping);
    }
  };

  return (
    <div className="p-4 bg-black text-white min-h-screen">
      <h2 className="text-2xl font-bold mb-4">🚀 Real-Time Messaging Demo</h2>

      {/* Online Friends */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">
          Online Friends ({onlineFriends.length})
        </h3>
        <div className="flex gap-2">
          {onlineFriends.map((friendId) => (
            <div
              key={friendId}
              className="bg-green-600 px-3 py-1 rounded-full text-sm"
            >
              {friendId}
            </div>
          ))}
        </div>
      </div>

      {/* Conversations */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">
          Conversations ({conversations.length})
        </h3>
        <div className="space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setSelectedConversation(conv.id)}
              className={`p-3 rounded cursor-pointer transition-colors ${
                selectedConversation === conv.id
                  ? "bg-blue-600"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              <div className="font-medium">{conv.other_user?.username}</div>
              <div className="text-sm text-gray-300">
                {conv.last_message?.content || "No messages yet"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      {selectedConversation && (
        <div className="border-t border-gray-700 pt-4">
          <h3 className="text-lg font-semibold mb-2">Messages</h3>
          <div className="mb-4 max-h-64 overflow-y-auto space-y-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`p-2 rounded ${
                  message.sender_id === user?.id
                    ? "bg-blue-600 ml-auto max-w-xs"
                    : "bg-gray-700 max-w-xs"
                }`}
              >
                <div className="text-sm font-medium">
                  {message.sender?.username}
                </div>
                <div>{message.content}</div>
                <div className="text-xs text-gray-300 mt-1">
                  {new Date(message.created_at).toLocaleTimeString()}
                  {message.is_seen && " ✓"}
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onFocus={() => handleTyping(true)}
              onBlur={() => handleTyping(false)}
              placeholder="Type a message..."
              className="flex-1 bg-gray-800 text-white px-3 py-2 rounded"
              disabled={sendingMessage}
            />
            <button
              onClick={handleSendMessage}
              disabled={sendingMessage || !messageInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded"
            >
              {sendingMessage ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {loading && <div className="text-center mt-4">Loading...</div>}
    </div>
  );
}
