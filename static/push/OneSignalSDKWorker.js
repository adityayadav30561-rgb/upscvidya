// OneSignal service worker, scoped to /push/ so it never collides with the
// SvelteKit service worker at "/" (build book Prompt 15 — SW coexistence).
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
