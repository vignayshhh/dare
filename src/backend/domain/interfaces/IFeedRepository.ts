export type EventType =
  | "post_created"
  | "dare_accepted"
  | "dare_completed"
  | "dare_sent"
  | "dare_received"
  | "dare_answered"
  | "dare_refused"
  | "truth_received"
  | "truth_answered"
  | "truth_refused"
  | "truth_completed";

export interface FeedEvent {
  id: string;
  userId: string;
  eventType: EventType;
  relatedPostId: string | null;
  relatedDareId: string | null;
  relatedTruthId: string | null;
  eventData: any;
  createdAt: string;
}

export interface CreateFeedEventRequest {
  userId: string;
  eventType: EventType;
  relatedPostId?: string;
  relatedDareId?: string;
  relatedTruthId?: string;
  eventData?: any;
}

export interface IFeedRepository {
  createFeedEvent(request: CreateFeedEventRequest): Promise<FeedEvent>;
  getFeedEventById(eventId: string): Promise<FeedEvent | null>;
  getFeedEventsForUser(userId: string, limit?: number): Promise<FeedEvent[]>;
  getFeedEventsByType(
    eventType: EventType,
    limit?: number,
  ): Promise<FeedEvent[]>;
  deleteFeedEvent(eventId: string): Promise<void>;
  getFeedEventsForUserFriends(
    userId: string,
    limit?: number,
  ): Promise<FeedEvent[]>;
  getPostById(postId: string): Promise<any>;
  getDareById(dareId: string): Promise<any>;
  getUserById(userId: string): Promise<any>;
}
