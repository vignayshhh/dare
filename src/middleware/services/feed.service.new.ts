import { IFeedRepository } from "@/backend/domain/interfaces/IFeedRepository";
import { FeedRepository } from "@/backend/repositories/FeedRepository";
import { IFriendshipRepository } from "@/backend/domain/interfaces/IFriendshipRepository";
import { FriendshipRepository } from "@/backend/repositories/FriendshipRepository";

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
  userId: string;
  eventType: "post_created" | "dare_accepted" | "dare_completed" | "dare_sent";
  relatedPostId?: string;
  relatedDareId?: string;
  eventData?: any;
}

class FeedService {
  private feedRepository: IFeedRepository;
  private friendshipRepository: IFriendshipRepository;

  constructor(
    feedRepository?: IFeedRepository,
    friendshipRepository?: IFriendshipRepository,
  ) {
    this.feedRepository = feedRepository || new FeedRepository();
    this.friendshipRepository =
      friendshipRepository || new FriendshipRepository();
  }

  async createFeedEvent(
    request: CreateFeedEventRequest,
  ): Promise<FeedEventResponse> {
    try {
      const event = await this.feedRepository.createFeedEvent(request);
      return { success: true, event };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getUserFeed(userId: string, limit?: number): Promise<FeedListResponse> {
    try {
      const events = await this.feedRepository.getFeedEventsForUser(
        userId,
        limit,
      );

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          return await this.enrichFeedEvent(event);
        }),
      );

      return { success: true, events: enrichedEvents };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getFriendsFeed(
    userId: string,
    limit?: number,
  ): Promise<FeedListResponse> {
    try {
      const events = await this.feedRepository.getFeedEventsForUserFriends(
        userId,
        limit,
      );

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          return await this.enrichFeedEvent(event);
        }),
      );

      return { success: true, events: enrichedEvents };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async getFeedEventsByType(
    eventType:
      | "post_created"
      | "dare_accepted"
      | "dare_completed"
      | "dare_sent",
    limit?: number,
  ): Promise<FeedListResponse> {
    try {
      const events = await this.feedRepository.getFeedEventsByType(
        eventType,
        limit,
      );

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          return await this.enrichFeedEvent(event);
        }),
      );

      return { success: true, events: enrichedEvents };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async deleteFeedEvent(
    eventId: string,
    userId: string,
  ): Promise<FeedEventResponse> {
    try {
      const event = await this.feedRepository.getFeedEventById(eventId);

      if (!event) {
        return { success: false, error: "Event not found" };
      }

      if (event.userId !== userId) {
        return { success: false, error: "Access denied" };
      }

      await this.feedRepository.deleteFeedEvent(eventId);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  async createPostCreatedEvent(
    userId: string,
    postId: string,
    postData?: any,
  ): Promise<FeedEventResponse> {
    return this.createFeedEvent({
      userId,
      eventType: "post_created",
      relatedPostId: postId,
      eventData: postData,
    });
  }

  async createDareSentEvent(
    userId: string,
    dareId: string,
    challengerId: string,
    receiverId: string,
    description: string,
  ): Promise<FeedEventResponse> {
    return this.createFeedEvent({
      userId,
      eventType: "dare_sent",
      relatedDareId: dareId,
      eventData: {
        challengerId,
        receiverId,
        description,
      },
    });
  }

  async createDareAcceptedEvent(
    userId: string,
    dareId: string,
    challengerId: string,
    receiverId: string,
  ): Promise<FeedEventResponse> {
    return this.createFeedEvent({
      userId,
      eventType: "dare_accepted",
      relatedDareId: dareId,
      eventData: {
        challengerId,
        receiverId,
      },
    });
  }

  async createDareCompletedEvent(
    userId: string,
    dareId: string,
    challengerId: string,
    receiverId: string,
    result: "REAL" | "FAKE",
    voteCount: number,
  ): Promise<FeedEventResponse> {
    return this.createFeedEvent({
      userId,
      eventType: "dare_completed",
      relatedDareId: dareId,
      eventData: {
        challengerId,
        receiverId,
        result,
        voteCount,
      },
    });
  }

  private async enrichFeedEvent(event: any): Promise<any> {
    try {
      const enrichedEvent = { ...event };

      if (event.relatedPostId) {
        enrichedEvent.post = await this.getPostData(event.relatedPostId);
      }

      if (event.relatedDareId) {
        enrichedEvent.dare = await this.getDareData(event.relatedDareId);
      }

      enrichedEvent.user = await this.getUserData(event.userId);

      return enrichedEvent;
    } catch (error) {
      console.error("Error enriching feed event:", error);
      return event;
    }
  }

  private async getPostData(postId: string): Promise<any> {
    try {
      return await this.feedRepository.getPostById(postId);
    } catch (error) {
      console.error("Error getting post data:", error);
      return null;
    }
  }

  private async getDareData(dareId: string): Promise<any> {
    try {
      return await this.feedRepository.getDareById(dareId);
    } catch (error) {
      console.error("Error getting dare data:", error);
      return null;
    }
  }

  private async getUserData(userId: string): Promise<any> {
    try {
      return await this.feedRepository.getUserById(userId);
    } catch (error) {
      console.error("Error getting user data:", error);
      return null;
    }
  }
}

const feedService = new FeedService();
export default feedService;
