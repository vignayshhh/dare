export type EventType = "post_created" | "dare_accepted" | "dare_completed" | "dare_sent";

export interface FeedEventResponse {
  success: boolean;
  event?: any;
  error?: string;
}

export interface FeedListResponse {
  success: boolean;
  events?: any[];
  error?: string;
}

export interface CreateFeedEventRequest {
  eventType: EventType;
  relatedPostId?: string;
  relatedDareId?: string;
  eventData?: any;
}

export interface GetFeedRequest {
  limit?: number;
}

export interface GetFriendsFeedRequest {
  limit?: number;
}

export interface DeleteFeedEventRequest {
  eventId: string;
}
