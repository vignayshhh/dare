"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  X,
  Image as ImageIcon,
  Video,
  Music,
  Send,
  Plus,
  Camera,
  AtSign,
} from "lucide-react";
import "@/styles/design-system.css";
import { Avatar } from "../ui/Avatar";
import { usePostsStore } from "../../stores/usePostsStore";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  buildLocalMediaPreview,
  type LocalMediaPreview,
  uploadOptimizedMedia,
} from "@/utils/mediaUpload";

interface MediaItem extends LocalMediaPreview {
  id: string;
}

interface Friend {
  id: string;
  name: string;
  username: string;
  avatar: string;
}

interface CreateFeedPostScreenProps {
  onBack: () => void;
}

export function CreateFeedPostScreen({ onBack }: CreateFeedPostScreenProps) {
  const [caption, setCaption] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isPreparingMedia, setIsPreparingMedia] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const objectUrlCleanupRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { createPost, loading } = usePostsStore();
  const { user } = useAuthStore();

  const mockGallery: MediaItem[] = [];
  const mockFriends: Friend[] = [];

  useEffect(() => {
    return () => {
      objectUrlCleanupRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlCleanupRef.current = [];
    };
  }, []);

  const registerPreviewUrls = (preview: LocalMediaPreview) => {
    objectUrlCleanupRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlCleanupRef.current = [preview.url];

    if (preview.thumbnail && preview.thumbnail.startsWith("blob:")) {
      objectUrlCleanupRef.current.push(preview.thumbnail);
    }
  };

  const handleRemoveMedia = () => {
    objectUrlCleanupRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlCleanupRef.current = [];
    setSelectedFile(null);
    setSelectedMedia(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsPreparingMedia(true);
      const preview = await buildLocalMediaPreview(file, "feed");
      registerPreviewUrls(preview);

      setSelectedFile(file);
      setSelectedMedia({
        ...preview,
        id: Date.now().toString(),
      });
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to prepare this file for upload.",
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      setIsPreparingMedia(false);
    }
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId],
    );
  };

  const handleTagInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTagInput(value);

    if (value.endsWith("@")) {
      setShowFriendPicker(true);
    }
  };

  const selectFriend = (friend: Friend) => {
    if (!selectedFriends.includes(friend.id)) {
      setSelectedFriends((prev) => [...prev, friend.id]);
    }
    setTagInput("");
    setShowFriendPicker(false);
  };

  const handleCreatePost = async () => {
    if (!caption.trim() && !selectedMedia) {
      return;
    }

    try {
      setIsUploadingMedia(true);

      const uploadedMedia =
        selectedFile && user?.id
          ? await uploadOptimizedMedia({
              source: selectedFile,
              userId: user.id,
              context: "feed",
              fileName: selectedFile.name,
            })
          : null;

      await createPost({
        content: caption.trim(),
        media:
          selectedMedia && uploadedMedia
            ? {
                type: selectedMedia.type,
                url: uploadedMedia.url,
                thumbnail: selectedMedia.thumbnail,
                duration: selectedMedia.duration,
              }
            : undefined,
        taggedFriends: selectedFriends,
      });

      setTimeout(() => {
        onBack();
      }, 500);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("User not authenticated")) {
          alert("Please log in to create posts.");
        } else {
          alert(`Failed to create post: ${error.message}`);
        }
      } else {
        alert("Failed to create post. Please try again.");
      }

      throw error;
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const selectedFriendsData = mockFriends.filter((friend) =>
    selectedFriends.includes(friend.id),
  );
  const isBusy = loading || isPreparingMedia || isUploadingMedia;

  return (
    <div className="min-h-screen bg-[#0a0f0a]">
      <div className="nav-header">
        <div className="p-4">
          <div className="flex items-center">
            <button onClick={onBack} className="btn-icon btn-ghost mr-4">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-white">Create Post</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24">
        {!selectedMedia && (
          <div className="mb-6">
            <button
              onClick={handleFileSelect}
              className="w-full bg-gradient-to-r from-[#4ade80] to-[#22c55e] text-black font-semibold py-4 rounded-xl flex items-center justify-center space-x-3 hover:from-[#22c55e] hover:to-[#16a34a] transition-all duration-200 shadow-lg shadow-[#4ade80]/25"
            >
              <Camera size={24} />
              <span>
                {isPreparingMedia
                  ? "Preparing media..."
                  : "Choose from Gallery"}
              </span>
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {selectedMedia && (
          <div className="mb-6">
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] rounded-2xl overflow-hidden border border-[#2a2a2a] shadow-xl">
              {selectedMedia.type === "image" ? (
                <div className="relative">
                  <img
                    src={selectedMedia.url}
                    alt="Selected image"
                    className="w-full h-[32rem] object-cover"
                  />
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 flex items-center space-x-1">
                    <ImageIcon size={14} className="text-white" />
                    <span className="text-white text-xs font-medium">
                      PHOTO
                    </span>
                  </div>
                </div>
              ) : selectedMedia.type === "video" ? (
                <div className="relative">
                  <img
                    src={selectedMedia.thumbnail || selectedMedia.url}
                    alt="Video thumbnail"
                    className="w-full h-[32rem] object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="bg-white/95 backdrop-blur-sm rounded-full p-6 shadow-lg">
                      <Video size={40} className="text-black" />
                    </div>
                  </div>
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 flex items-center space-x-1">
                    <Video size={14} className="text-white" />
                    <span className="text-white text-xs font-medium">
                      VIDEO
                    </span>
                  </div>
                  {selectedMedia.duration && (
                    <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm rounded px-2 py-1">
                      <span className="text-white text-sm font-medium">
                        {selectedMedia.duration}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[32rem] bg-gradient-to-br from-[#4ade80]/10 via-[#22c55e]/10 to-[#16a34a]/10 flex items-center justify-center relative">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                      <Music size={44} className="text-black" />
                    </div>
                    <p className="text-white font-semibold text-lg">
                      Audio File
                    </p>
                  </div>
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 flex items-center space-x-1">
                    <Music size={14} className="text-white" />
                    <span className="text-white text-xs font-medium">
                      AUDIO
                    </span>
                  </div>
                </div>
              )}

              <div className="p-4 bg-gradient-to-r from-[#1a1a1a] to-[#1f1f1f] border-t border-[#2a2a2a]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-xl flex items-center justify-center shadow-lg">
                      {selectedMedia.type === "image" ? (
                        <ImageIcon size={24} className="text-black" />
                      ) : selectedMedia.type === "video" ? (
                        <Video size={24} className="text-black" />
                      ) : (
                        <Music size={24} className="text-black" />
                      )}
                    </div>
                    <div>
                      <p className="text-white font-semibold capitalize">
                        {selectedMedia.type} Selected
                      </p>
                      <p className="text-[#94a3b8] text-sm">
                        {selectedMedia.sizeLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveMedia}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200 p-2 rounded-xl"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption..."
              className="w-full bg-transparent text-white placeholder-[#94a3b8] focus:outline-none resize-none"
              rows={caption.length > 100 ? 3 : caption.length > 50 ? 2 : 1}
              style={{ minHeight: "40px" }}
            />
          </div>
        </div>

        <div className="mb-6">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3">
            <div className="flex items-center">
              <AtSign size={20} className="text-[#94a3b8] mr-3" />
              <input
                type="text"
                value={tagInput}
                onChange={handleTagInput}
                placeholder="Tag friends..."
                className="flex-1 bg-transparent text-white placeholder-[#94a3b8] focus:outline-none"
              />
            </div>
          </div>

          <div className="relative">
            {showFriendPicker && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                {mockFriends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => selectFriend(friend)}
                    className="w-full p-3 flex items-center space-x-3 hover:bg-[#2a2a2a] transition-colors border-b border-[#2a2a2a] last:border-b-0"
                  >
                    <Avatar
                      src={friend.avatar}
                      alt={friend.name}
                      size="sm"
                      username={friend.username}
                    />
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium text-sm">
                        {friend.name}
                      </p>
                      <p className="text-[#94a3b8] text-xs">
                        {friend.username}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedFriendsData.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedFriendsData.map((friend) => (
                <div
                  key={friend.id}
                  className="bg-[#4ade80]/20 border border-[#4ade80]/30 rounded-full px-3 py-1 flex items-center space-x-2"
                >
                  <Avatar
                    src={friend.avatar}
                    alt={friend.name}
                    size="xs"
                    username={friend.username}
                  />
                  <span className="text-white text-sm">{friend.name}</span>
                  <button
                    onClick={() => toggleFriend(friend.id)}
                    className="text-[#94a3b8] hover:text-white transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#0a0f0a]/95 backdrop-blur-lg border-t border-[#2a2a2a] p-4">
        <button
          onClick={handleCreatePost}
          disabled={(!caption.trim() && !selectedMedia) || isBusy}
          className="w-full bg-gradient-to-r from-[#4ade80] to-[#22c55e] text-black font-semibold py-4 rounded-xl flex items-center justify-center space-x-2 hover:from-[#22c55e] hover:to-[#16a34a] transition-all duration-200 shadow-lg shadow-[#4ade80]/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isBusy ? (
            <>
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <span>{isUploadingMedia ? "Uploading..." : "Preparing..."}</span>
            </>
          ) : (
            <>
              <Send size={20} />
              <span>Post</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
