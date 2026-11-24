import type { NextRequest } from "next/server";
import { isFake } from "@cs/db";
import { searchCatalog } from "@cs/default-story";
import { rememberTitles } from "@cs/workflows";
import { handle } from "@/lib/api";

type Found = {
  source: string;
  externalId: string;
  title: string;
  year: number | null;
  kind: "book" | "movie" | "series";
  coverUrl: string | null;
  rating?: "family" | "teen" | "mature" | null;
};

const year = (s: unknown) => Number(String(s ?? "").slice(0, 4)) || null;

async function json(url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(3500) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function openLibrary(q: string): Promise<Found[]> {
  const data = await json(`https://openlibrary.org/search.json?limit=5&fields=key,title,first_publish_year,cover_i&q=${encodeURIComponent(q)}`);
  return ((data.docs as { key: string; title: string; first_publish_year?: number; cover_i?: number }[]) ?? []).map((d) => ({
    source: "openlibrary",
    externalId: d.key,
    title: d.title.slice(0, 120),
    year: d.first_publish_year ?? null,
    kind: "book",
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
  }));
}

async function googleBooks(q: string): Promise<Found[]> {
  if (isFake(process.env.GOOGLE_BOOKS_API_KEY)) return [];
  const data = await json(
    `https://www.googleapis.com/books/v1/volumes?maxResults=5&q=${encodeURIComponent(q)}&key=${encodeURIComponent(process.env.GOOGLE_BOOKS_API_KEY!)}`,
  );
  type Item = { id: string; volumeInfo: { title: string; publishedDate?: string; maturityRating?: string; imageLinks?: { thumbnail?: string } } };
  return ((data.items as Item[]) ?? []).map((i) => ({
    source: "google",
    externalId: i.id,
    title: i.volumeInfo.title.slice(0, 120),
    year: year(i.volumeInfo.publishedDate),
    kind: "book",
    coverUrl: i.volumeInfo.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
    // NOT_MATURE covers everything else, so only MATURE says something about the rating.
    rating: i.volumeInfo.maturityRating === "MATURE" ? "mature" : null,
  }));
}

const CERTIFICATION: Record<string, Found["rating"]> = {
  G: "family", PG: "family", "TV-Y": "family", "TV-Y7": "family", "TV-G": "family", "TV-PG": "family",
  "PG-13": "teen", "TV-14": "teen",
  R: "mature", "NC-17": "mature", "TV-MA": "mature",
};

async function tmdb(q: string): Promise<Found[]> {
  if (isFake(process.env.TMDB_API_KEY)) return [];
  const key = process.env.TMDB_API_KEY!;
  // TMDB accepts a short v3 key as a parameter, or a long v4 token as a header.
  const bearer = key.length > 40;
  const get = (path: string) =>
    json(`https://api.themoviedb.org/3${path}${bearer ? "" : `${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(key)}`}`, bearer ? { Authorization: `Bearer ${key}` } : {});
  const data = await get(`/search/multi?include_adult=false&query=${encodeURIComponent(q)}`);
  type Item = { id: number; media_type: string; title?: string; name?: string; release_date?: string; first_air_date?: string; poster_path?: string };
  const items = ((data.results as Item[]) ?? []).filter((x) => x.media_type === "movie" || x.media_type === "tv").slice(0, 6);
  return Promise.all(
    items.map(async (x): Promise<Found> => {
      const tv = x.media_type === "tv";
      let rating: Found["rating"] = null;
      try {
        const r = await get(tv ? `/tv/${x.id}/content_ratings` : `/movie/${x.id}/release_dates`);
        type Entry = { iso_3166_1: string; rating?: string; release_dates?: { certification: string }[] };
        const us = (r.results as Entry[]).find((e) => e.iso_3166_1 === "US");
        rating = CERTIFICATION[us?.rating ?? us?.release_dates?.map((d) => d.certification).find(Boolean) ?? ""] ?? null;
      } catch {
        // Without a certification the AI estimates the rating.
      }
      return {
        source: "tmdb",
        externalId: `${x.media_type}:${x.id}`,
        title: (x.title ?? x.name ?? "").slice(0, 120),
        year: year(x.release_date ?? x.first_air_date),
        kind: tv ? "series" : "movie",
        coverUrl: x.poster_path ? `https://image.tmdb.org/t/p/w185${x.poster_path}` : null,
        rating,
      };
    }),
  );
}

export const GET = (req: NextRequest) =>
  handle(async () => {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
    if (q.length < 2) return { results: [] };
    const builtin: Found[] = searchCatalog(q, 6).map((c) => ({
      source: "builtin",
      externalId: c.id,
      title: c.title,
      year: c.year,
      kind: c.kind,
      coverUrl: null,
    }));
    const external = process.env.OFFLINE_SEARCH === "1" ? [] : [tmdb(q), openLibrary(q), googleBooks(q)];
    const settled = await Promise.allSettled(external);
    const all = [...settled.flatMap((s) => (s.status === "fulfilled" ? s.value : [])), ...builtin];
    const seen = new Set<string>();
    const unique = all.filter((x) => {
      const key = `${x.kind}:${x.title.toLowerCase()}`;
      return x.title && !seen.has(key) && Boolean(seen.add(key));
    });
    return { results: await rememberTitles(unique.slice(0, 12)) };
  });
