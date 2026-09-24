const developmentOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const previewOrigin = /^https:\/\/likhartisan-[a-z0-9-]+\.vercel\.app$/;

export function isAllowedFrontendOrigin(origin, frontendUrl) {
  return !origin || developmentOrigin.test(origin) || origin === frontendUrl || previewOrigin.test(origin);
}
