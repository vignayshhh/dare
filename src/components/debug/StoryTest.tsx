"use client";

import { useState } from "react";
import { storyService, CreateStoryDTO } from "../../middleware/services/story.service";
import { useStoryStore } from "../../stores/useStoryStore";

export function StoryTest() {
  const [testUserId] = useState("test_user_123");
  const { stories, createStory, loadFriendsStories } = useStoryStore();

  const handleCreateTestStory = async () => {
    const testStory: CreateStoryDTO = {
      mediaUrl: "https://picsum.photos/seed/test-story/800/1200.jpg",
      mediaType: "image",
      caption: "Test story from debug component",
    };

    const result = await createStory(testUserId, testStory);
    console.log("Created story:", result);
  };

  const handleLoadStories = async () => {
    await loadFriendsStories(testUserId);
    console.log("Loaded stories:", stories);
  };

  return (
    <div className="fixed top-4 right-4 bg-black/90 text-white p-4 rounded-lg z-50 max-w-sm">
      <h3 className="text-lg font-bold mb-4">Story Debug Panel</h3>
      
      <div className="space-y-2">
        <button
          onClick={handleCreateTestStory}
          className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm"
        >
          Create Test Story
        </button>
        
        <button
          onClick={handleLoadStories}
          className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm"
        >
          Load Stories
        </button>
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold mb-2">Stories ({stories.length}):</p>
        <div className="max-h-32 overflow-y-auto text-xs">
          {stories.map((story) => (
            <div key={story.id} className="mb-1 p-1 bg-gray-800 rounded">
              <p>{story.author.displayName} - {story.media.type}</p>
              <p className="text-gray-400">Viewed: {story.hasViewed ? "Yes" : "No"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
