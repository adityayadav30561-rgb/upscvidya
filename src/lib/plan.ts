/** Guided-path plan math (Screens 01 & 18). Milestones compute from real
 *  inputs — attempt year + daily commitment — and regenerate when pace
 *  changes (Screen 19 re-uses these rows). */

export const PACES = [
	{ minutes: 30, label: '30 min', name: 'Recon pace', topicsPerDay: 0.75 },
	{ minutes: 60, label: '1 hr', name: 'Patrol pace', topicsPerDay: 1 },
	{ minutes: 120, label: '2 hr', name: 'Assault pace', topicsPerDay: 2 },
	{ minutes: 180, label: '3 hr+', name: 'Siege pace', topicsPerDay: 3 }
] as const;

export const TOTAL_UNITS = 103; // 94 chapters + 9 drill banks

/** CAPF AC paper: expected first Sunday of August (design copy). */
export function examDate(targetYear: number): Date {
	const d = new Date(Date.UTC(targetYear, 7, 1)); // 1 Aug
	const day = d.getUTCDay();
	const offset = day === 0 ? 0 : 7 - day;
	return new Date(Date.UTC(targetYear, 7, 1 + offset));
}

export interface Plan {
	examDay: Date;
	daysToExam: number;
	politySecured: Date; // all units conquered at the chosen pace
	mockSeason: Date; // exam minus 3 months
	bufferWeeks: number; // between polity secured and exam day
	topicsPerDay: number;
	quizzesPerDay: number;
	sprint: boolean; // <30 days out
}

export function computePlan(targetYear: number, dailyMinutes: number, from = new Date()): Plan {
	const pace = PACES.find((p) => p.minutes === dailyMinutes) ?? PACES[1];
	const examDay = examDate(targetYear);
	const daysToExam = Math.max(0, Math.ceil((examDay.getTime() - from.getTime()) / 86400000));
	const studyDays = Math.ceil(TOTAL_UNITS / pace.topicsPerDay);
	const politySecured = new Date(from.getTime() + studyDays * 86400000);
	const mockSeason = new Date(examDay.getTime());
	mockSeason.setUTCMonth(mockSeason.getUTCMonth() - 3);
	const bufferWeeks = Math.max(
		0,
		Math.floor((examDay.getTime() - politySecured.getTime()) / (7 * 86400000))
	);
	return {
		examDay,
		daysToExam,
		politySecured,
		mockSeason,
		bufferWeeks,
		topicsPerDay: pace.topicsPerDay,
		quizzesPerDay: 1,
		sprint: daysToExam < 30
	};
}

export const monthYear = (d: Date) =>
	d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
