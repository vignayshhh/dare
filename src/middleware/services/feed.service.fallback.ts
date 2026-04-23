// Temporary fallback for feed service while index builds
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getFirestore,
} from "firebase/firestore";
import { friendsService } from "./friends.service";

const db = getFirestore();

export async function getFeedFallback(
  userId: string,
  limitCount: number = 20,
): Promise<any[]> {
  try {
    // Simple query: just get user's own posts (no index required)
    const feedQuery = query(
      collection(db, "posts"),
      where("author_id", "==", userId),
      orderBy("created_at", "desc"),
      limit(limitCount),
    );

    const querySnapshot = await getDocs(feedQuery);
    const posts: any[] = [];

    for (const doc of querySnapshot.docs) {
      const post = { id: doc.id, ...doc.data() } as any;

      // Simple author info (mock for now)
      const author = {
        id: post.author_id,
        user_id: post.author_id,
        username: "user",
        display_name: "User",
        avatar_url: "",
      };

      posts.push({
        ...post,
        author,
        likes_count: 0,
        comments_count: 0,
        is_liked_by_user: false,
      });
    }

    return posts;
  } catch (error) {
    console.error("Error in fallback feed:", error);
    return [];
  }
}
