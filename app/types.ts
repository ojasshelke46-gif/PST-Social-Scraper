export type Platform = "linkedin" | "twitter";

export interface Post {
  platform: Platform;
  author: string;
  avatar?: string;
  text: string;
  likes: number;
  url: string;
  date: string;
  /** True when engagement count couldn't be resolved (kept null upstream). */
  likesUnavailable?: boolean;
}

export type SortKey = "likes" | "date";
export type PlatformFilter = "all" | Platform;
