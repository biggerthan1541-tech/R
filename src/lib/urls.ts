/** Canonical app origin, for links that leave the app (emails, evidence refs). */
export function appOrigin(): string {
  const url =
    process.env.AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

export function appUrl(path: string): string {
  return `${appOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
