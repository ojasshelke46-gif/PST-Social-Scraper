const BASE_URL = process.env.ANAKIN_BASE_URL || "https://api.anakin.io/v1";

export class AnakinError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "AnakinError";
  }
}

function apiKey(): string {
  const key = process.env.ANAKIN_API_KEY;
  if (!key) throw new AnakinError("ANAKIN_API_KEY is not set");
  return key;
}

function maskedKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)} (len ${key.length})`;
}

async function anakinFetch<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const key = apiKey();
  const url = `${BASE_URL}${path}`;
  const bodyJson = body ? JSON.stringify(body) : undefined;
  console.log(`[anakin] -> ${method} ${url} key=${maskedKey(key)}`);
  if (bodyJson) console.log(`[anakin] -> body=${bodyJson}`);

  const res = await fetch(url, {
    method,
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: bodyJson,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await res.text();
  console.log(
    `[anakin] <- ${path} status=${res.status} content-type=${res.headers.get("content-type")} body=${raw.slice(0, 1000)}`,
  );

  if (!res.ok) {
    throw new AnakinError(`Anakin ${method} ${path} failed (${res.status})`, res.status, raw.slice(0, 500));
  }
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    throw new AnakinError(`Anakin returned non-JSON for ${path}`, res.status, raw.slice(0, 500));
  }
}

export interface AnakinSearchResult {
  title?: string;
  url: string;
  snippet?: string;
  date?: string;
  last_updated?: string;
}

/** Synchronous Anakin search — returns indexed web results matching the prompt. */
export async function searchAnakin(prompt: string): Promise<AnakinSearchResult[]> {
  const res = await anakinFetch<{ id?: string; results?: AnakinSearchResult[] }>("POST", "/search", { prompt });
  return res.results ?? [];
}
