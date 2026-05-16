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
    <div className="min-h-screen overflow-x-hidden bg-[#050705] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(74,222,128,0.12),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(96,165,250,0.06),transparent_28%)]" />

      <div className="sticky top-0 z-30 border-b border-white/6 bg-[linear-gradient(180deg,rgba(5,7,5,0.98),rgba(5,7,5,0.88))] px-4 pb-4 pt-[calc(var(--safe-area-top)+16px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-white/80 shadow-[0_12px_28px_rgba(0,0,0,0.26)] transition-colors hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[25px] font-black leading-none tracking-[-0.04em] text-white">
              Create Post
            </h1>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-[calc(124px+var(--safe-area-bottom))] pt-5">
        {!selectedMedia && (
          <div className="mb-6">
            <button
              onClick={handleFileSelect}
              className="group relative flex min-h-[148px] w-full items-center justify-center overflow-hidden rounded-[30px] border border-[#4ade80]/18 bg-[linear-gradient(145deg,rgba(22,27,22,0.98),rgba(8,10,8,0.99))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.055)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4ade80]/35"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.75),transparent)]" />
              <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#4ade80]/12 blur-3xl" />
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#4ade80]/24 bg-[#4ade80]/12 text-[#4ade80] shadow-[0_0_24px_rgba(74,222,128,0.14)] transition-transform duration-200 group-hover:scale-105">
                  <Camera size={25} />
                </div>
                <div className="text-[17px] font-black tracking-[-0.02em] text-white">
                  {isPreparingMedia ? "Preparing media..." : "Choose from Gallery"}
                </div>
                <div className="mt-1 text-sm font-semibold text-white/38">
                  Photo, video, or audio
                </div>
              </div>
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
            <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(22,27,22,0.98),rgba(8,10,8,0.99))] shadow-[0_24px_72px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.055)]">
              {selectedMedia.type === "image" ? (
                <div className="relative">
                  <img
                    src={selectedMedia.url}
                    alt="Selected image"
                    className="w-full h-[32rem] object-cover"
                  />
                  <div className="absolute right-4 top-4 flex items-center space-x-1 rounded-full border border-white/12 bg-black/55 px-3 py-1 backdrop-blur-sm">
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
                  <div className="absolute right-4 top-4 flex items-center space-x-1 rounded-full border border-white/12 bg-black/55 px-3 py-1 backdrop-blur-sm">
                    <Video size={14} className="text-white" />
                    <span className="text-white text-xs font-medium">
                      VIDEO
                    </span>
                  </div>
                  {selectedMedia.duration && (
                    <div className="absolute bottom-4 left-4 rounded-full border border-white/12 bg-black/70 px-3 py-1 backdrop-blur-sm">
                      <span className="text-white text-sm font-medium">
                        {selectedMedia.duration}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative flex h-[32rem] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.14),rgba(255,255,255,0.025)_48%,rgba(0,0,0,0.08)_100%)]">
                  <div className="text-center">
                    <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-[24px] bg-gradient-to-br from-[#4ade80] to-[#22c55e] shadow-[0_18px_42px_rgba(74,222,128,0.2)]">
                      <Music size={44} className="text-black" />
                    </div>
                    <p className="text-white font-semibold text-lg">
                      Audio File
                    </p>
                  </div>
                  <div className="absolute right-4 top-4 flex items-center space-x-1 rounded-full border border-white/12 bg-black/55 px-3 py-1 backdrop-blur-sm">
                    <Music size={14} className="text-white" />
                    <span className="text-white text-xs font-medium">
                      AUDIO
                    </span>
                  </div>
                </div>
              )}

              <div className="border-t border-white/8 bg-white/[0.035] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/12 text-[#4ade80] shadow-[0_0_24px_rgba(74,222,128,0.12)]">
                      {selectedMedia.type === "image" ? (
                        <ImageIcon size={24} />
                      ) : selectedMedia.type === "video" ? (
                        <Video size={24} />
                      ) : (
                        <Music size={24} />
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
                    className="rounded-2xl border border-red-500/18 bg-red-500/10 p-2 text-red-300 transition-all duration-200 hover:bg-red-500/16 hover:text-red-200"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(18,22,18,0.98),rgba(8,10,8,0.99))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.045)]">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption..."
              className="w-full resize-none bg-transparent text-[16px] font-semibold text-white placeholder:text-white/30 focus:outline-none"
              rows={caption.length > 100 ? 3 : caption.length > 50 ? 2 : 1}
              style={{ minHeight: "40px" }}
            />
          </div>
        </div>

        <div className="mb-6">
          <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(18,22,18,0.98),rgba(8,10,8,0.99))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.045)]">
            <div className="flex items-center">
              <AtSign size={20} className="mr-3 text-[#4ade80]" />
              <input
                type="text"
                value={tagInput}
                onChange={handleTagInput}
                placeholder="Tag friends..."
                className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-white placeholder:text-white/30 focus:outline-none"
              />
            </div>
          </div>

          <div className="relative">
            {showFriendPicker && (
              <div className="absolute left-0 right-0 top-full z-10 mt-2 max-h-48 overflow-y-auto rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,22,18,0.99),rgba(9,11,9,0.99))] shadow-[0_24px_54px_rgba(0,0,0,0.42)]">
                {mockFriends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => selectFriend(friend)}
                    className="flex w-full items-center space-x-3 border-b border-white/6 p-3 transition-colors last:border-b-0 hover:bg-white/[0.045]"
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
                  className="flex items-center space-x-2 rounded-full border border-[#4ade80]/24 bg-[#4ade80]/10 px-3 py-1"
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
                    className="text-white/42 transition-colors hover:text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/8 bg-[linear-gradient(180deg,rgba(5,7,5,0.82),rgba(5,7,5,0.98))] px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={handleCreatePost}
            disabled={(!caption.trim() && !selectedMedia) || isBusy}
            className="flex w-full items-center justify-center space-x-2 rounded-[20px] bg-gradient-to-r from-[#4ade80] to-[#22c55e] py-4 font-black text-black shadow-[0_16px_42px_rgba(74,222,128,0.24)] transition-all duration-200 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          >
            {isBusy ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
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
    </div>
  );
}
