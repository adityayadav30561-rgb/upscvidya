// SPA mode: client-side rendering only. Static adapter emits an index.html
// fallback so dynamic routes (map/:region, topic/:id, quiz/:id) resolve on the
// client. Prerendering can be re-enabled per-route later for static content.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'never';
