/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// SvelteKit native service worker. Caches the app shell + static assets on
// install, serves cache-first for shell, and network-first for topic reads so
// offline reading works. Quiz/test endpoints are never cached — they require
// network (see NETWORK_ONLY).
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `upscvidya-cache-${version}`;
const APP_SHELL = [...build, ...files];

// Paths that must always hit the network (quizzes, tests, live data).
const NETWORK_ONLY = [/\/quiz\//, /\/test\//, /\/api\//];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
	sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
		)
	);
	sw.clients.claim();
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;
	if (NETWORK_ONLY.some((re) => re.test(url.pathname))) return; // let it hit network, no cache

	// App shell / build assets: cache-first.
	if (APP_SHELL.includes(url.pathname)) {
		event.respondWith(
			caches.match(request).then((cached) => cached ?? fetch(request))
		);
		return;
	}

	// Everything else (topic reads, pages): network-first, fall back to cache.
	event.respondWith(
		fetch(request)
			.then((res) => {
				if (res.ok) {
					const clone = res.clone();
					caches.open(CACHE).then((cache) => cache.put(request, clone));
				}
				return res;
			})
			.catch(() => caches.match(request).then((c) => c ?? Response.error()))
	);
});
