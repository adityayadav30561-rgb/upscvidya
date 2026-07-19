/** Theme state — light is the design default; dark = OLED night-study variant. */

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;

const state = $state({ theme: (stored === 'dark' ? 'dark' : 'light') as 'light' | 'dark' });

export function getTheme() {
	return state.theme;
}

export function toggleTheme() {
	setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

export function setTheme(theme: 'light' | 'dark') {
	state.theme = theme;
	if (typeof document !== 'undefined') {
		if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
		else document.documentElement.removeAttribute('data-theme');
	}
	if (typeof localStorage !== 'undefined') localStorage.setItem('theme', theme);
}
