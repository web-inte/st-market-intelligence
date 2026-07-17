import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/account",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/api/",
      ],
    },
    sitemap: "https://st-market.com/sitemap.xml",
  };
}
