/** Toast queue — showToast('Territory secured!', 'success'). */

export interface ToastItem {
	id: number;
	message: string;
	type: 'info' | 'success' | 'error';
}

let nextId = 0;
const state = $state<{ toasts: ToastItem[] }>({ toasts: [] });

export function getToasts() {
	return state.toasts;
}

export function showToast(message: string, type: ToastItem['type'] = 'info', duration = 3200) {
	const id = nextId++;
	state.toasts.push({ id, message, type });
	setTimeout(() => dismissToast(id), duration);
	return id;
}

export function dismissToast(id: number) {
	const i = state.toasts.findIndex((t) => t.id === id);
	if (i !== -1) state.toasts.splice(i, 1);
}
