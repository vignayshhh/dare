/**
 * Cache Module Exports
 * 
 * Centralized exports for the caching system
 */

export {
  FeedCacheManager,
  feedCache,
  userPostsCache,
  authorCache,
  type CacheConfig,
} from "./FeedCacheManager";

export {
  BatchQueryOptimizer,
  batchQueryOptimizer,
} from "./BatchQueryOptimizer";
