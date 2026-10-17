import type { MetadataRoute } from "next";
import { env } from "@/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: env.SITE_URL, changeFrequency: "monthly", priority: 1 }];
}
