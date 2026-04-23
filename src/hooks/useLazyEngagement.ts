import { useEffect, useRef, useState } from "react";

interface UseLazyEngagementOptions {
  threshold?: number;
  rootMargin?: string;
}

/**
 * Hook for lazy loading engagement data when posts scroll into viewport
 * Uses Intersection Observer to detect visibility
 */
export function useLazyEngagement(
  postId: string,
  onLoad: (postId: string) => void,
  options: UseLazyEngagementOptions = {},
) {
  const { threshold = 0.1, rootMargin = "200px" } = options;
  const elementRef = useRef<HTMLElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || isLoaded) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoaded) {
            setIsLoaded(true);
            onLoad(postId);
            observer.disconnect();
          }
        });
      },
      { threshold, rootMargin },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [postId, onLoad, isLoaded, threshold, rootMargin]);

  return { elementRef, isLoaded };
}
