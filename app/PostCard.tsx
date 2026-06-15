import type { CSSProperties } from "react";
import type { Post } from "./types";
import {
  LinkedInIcon,
  XIcon,
  HeartIcon,
  ArrowUpRightIcon,
} from "./icons";

const PLATFORM_META = {
  linkedin: {
    label: "LinkedIn",
    color: "var(--linkedin)",
    soft: "rgba(79, 155, 255, 0.14)",
    Icon: LinkedInIcon,
  },
  twitter: {
    label: "X",
    color: "var(--twitter)",
    soft: "rgba(214, 221, 232, 0.12)",
    Icon: XIcon,
  },
} as const;

function highlight(text: string, keyword: string) {
  if (!keyword.trim()) return text;
  const safe = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safe})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.trim().toLowerCase() ? (
      <mark key={i}>{part}</mark>
    ) : (
      part
    )
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PostCard({
  post,
  keyword,
  maxLikes,
}: {
  post: Post;
  keyword: string;
  maxLikes: number;
}) {
  const meta = PLATFORM_META[post.platform];
  const { Icon } = meta;
  const pct = maxLikes > 0 ? Math.max(4, (post.likes / maxLikes) * 100) : 0;

  const style = {
    "--platform": meta.color,
    "--platform-soft": meta.soft,
  } as CSSProperties;

  return (
    <article className="card" style={style}>
      <div className="card-head">
        <span className="badge">
          <Icon />
          {meta.label}
        </span>
        <span className="author">{post.author}</span>
        <time className="date" dateTime={post.date}>
          {formatDate(post.date)}
        </time>
      </div>

      <p className="card-text">{highlight(post.text, keyword)}</p>

      <div className="engagement">
        <span className="likes">
          <HeartIcon />
          {post.likes.toLocaleString()}
        </span>
        <span
          className="bar"
          role="img"
          aria-label={`${post.likes.toLocaleString()} likes, relative to top post`}
        >
          <span className="bar-fill" style={{ width: `${pct}%` }} />
        </span>
        <a
          className="view-link"
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View original
          <ArrowUpRightIcon />
        </a>
      </div>
    </article>
  );
}
