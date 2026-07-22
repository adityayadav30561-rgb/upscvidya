/** Offline notes cache (build book Prompt 06, point 3).
 *  Topic note payloads are cached in IndexedDB when opened so airplane-mode
 *  reopens work. Only entitled payloads are ever cached — the data comes from
 *  the entitled API response, so premium gating stays server-side. Quizzes and
 *  everything write-based remain online-only. */

export interface CachedNote {
	code: string; // id_code (POL-05, APX-1)
	title: string;
	notes_md: string;
	est_read_minutes: number;
	mcq_floor: number;
	region: string;
	book_ref: string;
	cached_at: number;
}

const DB = 'upscvidya-offline';
const STORE = 'notes';
const VERSION = 1;

function idb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB unavailable'));
			return;
		}
		const req = indexedDB.open(DB, VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'code' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return idb().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const store = db.transaction(STORE, mode).objectStore(STORE);
				const req = fn(store);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			})
	);
}

export async function cacheNote(note: Omit<CachedNote, 'cached_at'>): Promise<void> {
	try {
		await tx('readwrite', (s) => s.put({ ...note, cached_at: Date.now() }));
	} catch {
		/* storage unavailable — offline is best-effort */
	}
}

export async function getCachedNote(code: string): Promise<CachedNote | null> {
	try {
		return (await tx<CachedNote | undefined>('readonly', (s) => s.get(code))) ?? null;
	} catch {
		return null;
	}
}

export async function cachedCodes(): Promise<string[]> {
	try {
		const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
		return keys.map(String);
	} catch {
		return [];
	}
}

export async function isCached(code: string): Promise<boolean> {
	return (await getCachedNote(code)) !== null;
}

export async function removeAllCached(): Promise<void> {
	try {
		await tx('readwrite', (s) => s.clear());
	} catch {
		/* noop */
	}
}
