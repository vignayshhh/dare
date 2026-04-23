export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          username: string;
          display_name: string | null;
          bio: string | null;
          avatar_url: string | null;
          visibility: "PUBLIC" | "PRIVATE";
          is_18_plus: boolean;
          consent_accepted: boolean;
          dares_completed: number;
          dares_refused: number;
          ghost_mode_active: boolean;
          ghost_mode_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profiles"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: "pending" | "accepted" | "rejected";
          created_at: string;
          accepted_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["friendships"]["Row"],
          "id" | "created_at" | "accepted_at"
        >;
        Update: Partial<Database["public"]["Tables"]["friendships"]["Insert"]>;
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          content: string | null;
          media_url: string | null;
          media_type: "TEXT" | "PHOTO" | "VIDEO" | null;
          view_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["posts"]["Row"],
          "id" | "created_at" | "updated_at" | "view_count"
        >;
        Update: Partial<Database["public"]["Tables"]["posts"]["Insert"]>;
      };
      post_likes: {
        Row: {
          id: string;
          post_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["post_likes"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["post_likes"]["Insert"]>;
      };
      post_views: {
        Row: {
          id: string;
          post_id: string;
          viewer_id: string;
          view_count: number;
          first_viewed_at: string;
          last_viewed_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["post_views"]["Row"],
          "id" | "first_viewed_at" | "last_viewed_at"
        >;
        Update: Partial<Database["public"]["Tables"]["post_views"]["Insert"]>;
      };
      dares: {
        Row: {
          id: string;
          challenger_id: string;
          receiver_id: string;
          description: string;
          state:
            | "SENT"
            | "ACCEPTED"
            | "CHICKEN_OUT"
            | "PROOF_SUBMITTED"
            | "UNDER_REVIEW"
            | "FRIENDS_VALIDATION"
            | "ACCEPTED_REAL"
            | "REJECTED_FAKE";
          proof_media_url: string | null;
          proof_media_type: "TEXT" | "PHOTO" | "VIDEO" | null;
          challenger_vote: "REAL" | "FAKE" | null;
          validation_threshold_met: boolean;
          created_at: string;
          updated_at: string;
          accepted_at: string | null;
          proof_submitted_at: string | null;
          completed_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["dares"]["Row"],
          | "id"
          | "created_at"
          | "updated_at"
          | "accepted_at"
          | "proof_submitted_at"
          | "completed_at"
          | "validation_threshold_met"
        >;
        Update: Partial<Database["public"]["Tables"]["dares"]["Insert"]>;
      };
      dare_votes: {
        Row: {
          id: string;
          dare_id: string;
          voter_id: string;
          vote: "REAL" | "FAKE";
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["dare_votes"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["dare_votes"]["Insert"]>;
      };
      profile_views: {
        Row: {
          id: string;
          profile_id: string;
          viewer_id: string;
          view_count: number;
          first_viewed_at: string;
          last_viewed_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["profile_views"]["Row"],
          "id" | "first_viewed_at" | "last_viewed_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["profile_views"]["Insert"]
        >;
      };
      presence: {
        Row: {
          id: string;
          user_id: string;
          is_online: boolean;
          last_seen: string;
          current_profile_viewing: string | null;
          typing_in_chat_with: string | null;
          ghost_mode: boolean;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["presence"]["Row"],
          "id" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["presence"]["Insert"]>;
      };
      feed_events: {
        Row: {
          id: string;
          user_id: string;
          event_type:
            | "post_created"
            | "dare_accepted"
            | "dare_completed"
            | "dare_sent";
          related_post_id: string | null;
          related_dare_id: string | null;
          event_data: Json | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["feed_events"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["feed_events"]["Insert"]>;
      };
      conversations: {
        Row: {
          id: string;
          user1_id: string;
          user2_id: string;
          last_message_id: string | null;
          is_active: boolean;
          is_frozen: boolean;
          frozen_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["conversations"]["Row"],
          "id" | "created_at" | "updated_at" | "last_message_id"
        >;
        Update: Partial<
          Database["public"]["Tables"]["conversations"]["Insert"]
        >;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          media_url: string | null;
          media_type: "TEXT" | "PHOTO" | "VIDEO";
          is_delivered: boolean;
          is_seen: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["messages"]["Row"],
          "id" | "created_at" | "is_delivered" | "is_seen"
        >;
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
      message_events: {
        Row: {
          id: string;
          message_id: string;
          event_type:
            | "sent"
            | "delivered"
            | "seen"
            | "screenshot"
            | "typing_started"
            | "typing_stopped"
            | "almost_sent";
          user_id: string;
          event_data: Json | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["message_events"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["message_events"]["Insert"]
        >;
      };
      typing_indicators: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          typing_speed: "slow" | "normal" | "fast" | "furious";
          started_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["typing_indicators"]["Row"],
          "id" | "started_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["typing_indicators"]["Insert"]
        >;
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string | null;
          reported_post_id: string | null;
          reported_dare_id: string | null;
          reported_message_id: string | null;
          reason:
            | "harassment"
            | "spam"
            | "inappropriate_content"
            | "fake_profile"
            | "other";
          description: string;
          status: "pending" | "reviewing" | "resolved";
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["reports"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
      };
      moderation_actions: {
        Row: {
          id: string;
          moderator_id: string;
          target_user_id: string;
          action:
            | "warning"
            | "temporary_suspend"
            | "permanent_ban"
            | "content_removal";
          reason: string;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["moderation_actions"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["moderation_actions"]["Insert"]
        >;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_friend: {
        Args: {
          target_user_id: string;
          current_user_id?: string;
        };
        Returns: boolean;
      };
      can_view_profile: {
        Args: {
          profile_id: string;
          viewer_id?: string;
        };
        Returns: boolean;
      };
      can_dare_user: {
        Args: {
          challenger_id: string;
          receiver_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      dare_state:
        | "SENT"
        | "ACCEPTED"
        | "CHICKEN_OUT"
        | "PROOF_SUBMITTED"
        | "UNDER_REVIEW"
        | "FRIENDS_VALIDATION"
        | "ACCEPTED_REAL"
        | "REJECTED_FAKE";
      vote_type: "REAL" | "FAKE";
      post_type: "TEXT" | "PHOTO" | "VIDEO";
      profile_visibility: "PUBLIC" | "PRIVATE";
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Friendship = Database["public"]["Tables"]["friendships"]["Row"];
export type Post = Database["public"]["Tables"]["posts"]["Row"];
export type PostLike = Database["public"]["Tables"]["post_likes"]["Row"];
export type PostView = Database["public"]["Tables"]["post_views"]["Row"];
export type Dare = Database["public"]["Tables"]["dares"]["Row"];
export type DareVote = Database["public"]["Tables"]["dare_votes"]["Row"];
export type ProfileView = Database["public"]["Tables"]["profile_views"]["Row"];
export type Presence = Database["public"]["Tables"]["presence"]["Row"];
export type FeedEvent = Database["public"]["Tables"]["feed_events"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageEvent =
  Database["public"]["Tables"]["message_events"]["Row"];
export type TypingIndicator =
  Database["public"]["Tables"]["typing_indicators"]["Row"];

export type DareState = Database["public"]["Enums"]["dare_state"];
export type VoteType = Database["public"]["Enums"]["vote_type"];
export type PostType = Database["public"]["Enums"]["post_type"];
export type ProfileVisibility =
  Database["public"]["Enums"]["profile_visibility"];
