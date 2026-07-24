/** Small native-feel helpers for the mobile PWA. */

/** Android haptic tap (no-op on iOS Safari / desktop — vibrate is unsupported
 *  there and silently ignored). Kept tiny and feature-detected. */
export function haptic(ms = 8): void {
	try {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
	} catch {
		/* some browsers throw on blocked vibrate — ignore */
	}
}

/** True on a coarse-pointer (touch) device — gate touch-only UI like the
 *  edge-swipe affordance so desktop mouse users never see it. */
export function isTouch(): boolean {
	return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}
