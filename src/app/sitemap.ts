import { MetadataRoute } from "next";
import { listPosts } from "@/lib/posts/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://escuelas-river.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let posts: Array<{ schoolSlug: string; slug: string; updatedAt: Date }> = [];
  try {
    const result = await listPosts({
      status: "published",
      limit: 500,
    });
    posts = result.posts;
  } catch {
    // Índices Firestore pueden no estar creados aún
  }

  const noteUrls: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE_URL}/escuelas/${post.schoolSlug}/notas/${post.slug}`,
    lastModified: post.updatedAt instanceof Date ? post.updatedAt : new Date(post.updatedAt),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${BASE_URL}/notas`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    ...noteUrls,
  ];
}
