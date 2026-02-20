import { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:9002";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${BASE_URL}/auth/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/auth/registro`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ];
}
