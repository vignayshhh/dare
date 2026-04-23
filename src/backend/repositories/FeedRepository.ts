import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/backend/lib/firebase";
import {
  IFeedRepository,
  FeedEvent,
  EventType,
  CreateFeedEventRequest,
} from "@/backend/domain/interfaces/IFeedRepository";

export class FeedRepository implements IFeedRepository {
  async createFeedEvent(request: CreateFeedEventRequest): Promise<FeedEvent> {
    try {
      const eventRef = await addDoc(collection(db, "feed_events"), {
        user_id: request.userId,
        event_type: request.eventType,
        related_post_id: request.relatedPostId || null,
        related_dare_id: request.relatedDareId || null,
        related_truth_id: request.relatedTruthId || null,
        event_data: request.eventData || null,
        created_at: serverTimestamp(),
      });

      const event = await this.getFeedEventById(eventRef.id);
      if (!event) {
        throw new Error("Failed to create feed event");
      }
      return event;
    } catch (error) {
      console.error("createFeedEvent error:", error);
      throw error;
    }
  }

  async getFeedEventsForUser(
    userId: string,
    limitCount: number = 50,
  ): Promise<FeedEvent[]> {
    try {
      const eventsQuery = query(
        collection(db, "feed_events"),
        where("user_id", "==", userId),
        orderBy("created_at", "desc"),
        limit(limitCount),
      );

      const querySnapshot = await getDocs(eventsQuery);
      const events: FeedEvent[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        events.push(this.mapToFeedEvent(data));
      });

      return events;
    } catch (error) {
      console.error("getFeedEventsForUser error:", error);
      throw error;
    }
  }

  async getFeedEventsByType(
    eventType: EventType,
    limitCount: number = 50,
  ): Promise<FeedEvent[]> {
    try {
      const eventsQuery = query(
        collection(db, "feed_events"),
        where("event_type", "==", eventType),
        orderBy("created_at", "desc"),
        limit(limitCount),
      );

      const querySnapshot = await getDocs(eventsQuery);
      const events: FeedEvent[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        events.push(this.mapToFeedEvent(data));
      });

      return events;
    } catch (error) {
      console.error("getFeedEventsByType error:", error);
      throw error;
    }
  }

  async deleteFeedEvent(eventId: string): Promise<void> {
    try {
      const eventRef = doc(db, "feed_events", eventId);
      await deleteDoc(eventRef);
    } catch (error) {
      console.error("deleteFeedEvent error:", error);
      throw error;
    }
  }

  async getFeedEventsForUserFriends(
    userId: string,
    limitCount: number = 50,
  ): Promise<FeedEvent[]> {
    try {
      const friendshipsQuery = query(
        collection(db, "friendships"),
        where("requester_id", "==", userId),
        where("status", "==", "accepted"),
      );

      const friendshipsSnapshot = await getDocs(friendshipsQuery);
      const friendIds: string[] = [];

      friendshipsSnapshot.forEach((doc) => {
        const data = doc.data();
        friendIds.push(data.addressee_id);
      });

      const addresseeQuery = query(
        collection(db, "friendships"),
        where("addressee_id", "==", userId),
        where("status", "==", "accepted"),
      );

      const addresseeSnapshot = await getDocs(addresseeQuery);

      addresseeSnapshot.forEach((doc) => {
        const data = doc.data();
        friendIds.push(data.requester_id);
      });

      if (friendIds.length === 0) {
        return [];
      }

      const eventsQuery = query(
        collection(db, "feed_events"),
        where("user_id", "in", friendIds),
        orderBy("created_at", "desc"),
        limit(limitCount),
      );

      const eventsSnapshot = await getDocs(eventsQuery);
      const events: FeedEvent[] = [];

      eventsSnapshot.forEach((doc) => {
        const data = doc.data();
        events.push(this.mapToFeedEvent(data));
      });

      return events;
    } catch (error) {
      console.error("getFeedEventsForUserFriends error:", error);
      throw error;
    }
  }

  async getFeedEventById(eventId: string): Promise<FeedEvent | null> {
    try {
      const eventDocRef = doc(db, "feed_events", eventId);
      const eventDoc = await getDoc(eventDocRef);

      if (!eventDoc.exists()) {
        return null;
      }

      const data = eventDoc.data();
      return this.mapToFeedEvent(data);
    } catch (error) {
      console.error("getFeedEventById error:", error);
      return null;
    }
  }

  async getPostById(postId: string): Promise<any> {
    try {
      const postDocRef = doc(db, "posts", postId);
      const postDoc = await getDoc(postDocRef);
      return postDoc.exists() ? postDoc.data() : null;
    } catch (error) {
      console.error("getPostById error:", error);
      return null;
    }
  }

  async getDareById(dareId: string): Promise<any> {
    try {
      const dareDocRef = doc(db, "dares", dareId);
      const dareDoc = await getDoc(dareDocRef);
      return dareDoc.exists() ? dareDoc.data() : null;
    } catch (error) {
      console.error("getDareById error:", error);
      return null;
    }
  }

  async getUserById(userId: string): Promise<any> {
    try {
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);
      return userDoc.exists() ? userDoc.data() : null;
    } catch (error) {
      console.error("getUserById error:", error);
      return null;
    }
  }

  private mapToFeedEvent(data: any): FeedEvent {
    return {
      id: data.id || "",
      userId: data.user_id,
      eventType: data.event_type,
      relatedPostId: data.related_post_id,
      relatedDareId: data.related_dare_id,
      relatedTruthId: data.related_truth_id,
      eventData: data.event_data,
      createdAt: data.created_at,
    };
  }
}
