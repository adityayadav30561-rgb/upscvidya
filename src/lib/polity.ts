/** Static Polity syllabus registry — the map skeleton (docs/polity-mvp-master.md).
 *  All 103 units (94 chapters + 9 appendix drills) render on the territory map
 *  regardless of what content is live in PocketBase; live topics_public rows
 *  overlay onto these entries by id_code. POL-55 is intentionally absent (the
 *  reference book has no ch. 55; IDs preserve the 1:1 chapter map). */

import type { Region } from './types';

export interface RegionMeta {
	code: Region;
	name: string;
	/** short blurb used on collapsed banner rows */
	blurb: string;
}

/** The 8 conquerable regions, in syllabus order. */
export const REGIONS: RegionMeta[] = [
	{ code: 'foundations', name: 'Foundations', blurb: 'Part I — the constitutional bedrock' },
	{ code: 'system', name: 'The System', blurb: 'Part II — how the government is wired' },
	{ code: 'centre', name: 'The Centre', blurb: 'Part III — President to PIL' },
	{ code: 'states', name: 'The States', blurb: 'Part IV — Governor to Lok Adalats' },
	{ code: 'grassroots', name: 'Grassroots & Territories', blurb: 'Parts V–VI — local government & UTs' },
	{ code: 'institutions', name: 'The Institutions', blurb: 'Parts VII–VIII — bodies of the republic' },
	{ code: 'dynamics', name: 'Dynamics & Dimensions', blurb: 'Parts IX–XI — politics in motion' },
	{ code: 'courtroom', name: 'The Courtroom & The World', blurb: 'Parts XII–XIII — judgements & comparisons' }
];

export interface SyllabusUnit {
	/** POL-01…POL-95 / APX-1…APX-9 */
	code: string;
	title: string;
	/** short node label (design: "Fund. Rights", "PM & Council") */
	label: string;
	region: Region;
	/** chapter number = guided order; APX get 900+n and sit at region end */
	order: number;
	kind: 'chapter' | 'appendix';
	/** MCQ floor from the master doc */
	floor: number;
}

const u = (
	code: string,
	title: string,
	label: string,
	region: Region,
	order: number,
	floor: number,
	kind: 'chapter' | 'appendix' = 'chapter'
): SyllabusUnit => ({ code, title, label, region, order, kind, floor });

export const UNITS: SyllabusUnit[] = [
	// PART I — Foundations
	u('POL-01', 'Historical Background', 'History', 'foundations', 1, 35),
	u('POL-02', 'Making of the Constitution', 'Making of it', 'foundations', 2, 30),
	u('POL-03', 'Concept of the Constitution', 'Concept', 'foundations', 3, 20),
	u('POL-04', 'Salient Features of the Constitution', 'Salient Features', 'foundations', 4, 30),
	u('POL-05', 'Preamble of the Constitution', 'Preamble', 'foundations', 5, 25),
	u('POL-06', 'Union and Its Territory', 'Union & Territory', 'foundations', 6, 25),
	u('POL-07', 'Citizenship', 'Citizenship', 'foundations', 7, 30),
	u('POL-08', 'Fundamental Rights', 'Fund. Rights', 'foundations', 8, 50),
	u('POL-09', 'Directive Principles of State Policy', 'DPSP', 'foundations', 9, 30),
	u('POL-10', 'Fundamental Duties', 'Fund. Duties', 'foundations', 10, 20),
	u('POL-11', 'Amendment of the Constitution', 'Amendment', 'foundations', 11, 25),
	u('POL-12', 'Basic Structure of the Constitution', 'Basic Structure', 'foundations', 12, 25),
	// PART II — The System
	u('POL-13', 'Parliamentary System', 'Parliamentary Sys.', 'system', 13, 25),
	u('POL-14', 'Federal System', 'Federal Sys.', 'system', 14, 25),
	u('POL-15', 'Centre-State Relations', 'Centre-State', 'system', 15, 35),
	u('POL-16', 'Inter-State Relations', 'Inter-State', 'system', 16, 25),
	u('POL-17', 'Emergency Provisions', 'Emergency', 'system', 17, 30),
	// PART III — The Centre
	u('POL-18', 'President', 'President', 'centre', 18, 40),
	u('POL-19', 'Vice-President', 'Vice-President', 'centre', 19, 20),
	u('POL-20', 'Prime Minister', 'PM', 'centre', 20, 20),
	u('POL-21', 'Central Council of Ministers', 'Council of Ministers', 'centre', 21, 25),
	u('POL-22', 'Cabinet Committees', 'Cabinet Cttes.', 'centre', 22, 15),
	u('POL-23', 'Parliament', 'Parliament', 'centre', 23, 55),
	u('POL-24', 'Parliamentary Committees', 'Parl. Cttes.', 'centre', 24, 25),
	u('POL-25', 'Indian Parliamentary Group', 'IPG', 'centre', 25, 10),
	u('POL-26', 'Supreme Court', 'Supreme Court', 'centre', 26, 35),
	u('POL-27', 'Judicial Review', 'Jud. Review', 'centre', 27, 20),
	u('POL-28', 'Judicial Activism', 'Jud. Activism', 'centre', 28, 15),
	u('POL-29', 'Public Interest Litigation', 'PIL', 'centre', 29, 15),
	// PART IV — The States
	u('POL-30', 'Governor', 'Governor', 'states', 30, 30),
	u('POL-31', 'Chief Minister', 'CM', 'states', 31, 15),
	u('POL-32', 'State Council of Ministers', 'State Council', 'states', 32, 15),
	u('POL-33', 'State Legislature', 'State Legislature', 'states', 33, 30),
	u('POL-34', 'High Court', 'High Court', 'states', 34, 25),
	u('POL-35', 'Subordinate Courts', 'Subordinate Courts', 'states', 35, 15),
	u('POL-36', 'Tribunals', 'Tribunals', 'states', 36, 20),
	u('POL-37', 'Consumer Commissions', 'Consumer Comm.', 'states', 37, 15),
	u('POL-38', 'Lok Adalats and Other Courts', 'Lok Adalats', 'states', 38, 15),
	// PARTS V–VI — Grassroots & Territories
	u('POL-39', 'Panchayati Raj', 'Panchayati Raj', 'grassroots', 39, 35),
	u('POL-40', 'Municipalities', 'Municipalities', 'grassroots', 40, 25),
	u('POL-41', 'Union Territories', 'UTs', 'grassroots', 41, 20),
	u('POL-42', 'Scheduled and Tribal Areas', 'Scheduled Areas', 'grassroots', 42, 20),
	// PARTS VII–VIII — The Institutions
	u('POL-43', 'Election Commission', 'ECI', 'institutions', 43, 30),
	u('POL-44', 'Union Public Service Commission', 'UPSC', 'institutions', 44, 20),
	u('POL-45', 'State Public Service Commission', 'SPSC', 'institutions', 45, 15),
	u('POL-46', 'Finance Commission', 'Fin. Commission', 'institutions', 46, 25),
	u('POL-47', 'Goods and Services Tax Council', 'GST Council', 'institutions', 47, 20),
	u('POL-48', 'National Commission for SCs', 'NCSC', 'institutions', 48, 15),
	u('POL-49', 'National Commission for STs', 'NCST', 'institutions', 49, 15),
	u('POL-50', 'National Commission for BCs', 'NCBC', 'institutions', 50, 15),
	u('POL-51', 'Special Officer for Linguistic Minorities', 'Linguistic Min.', 'institutions', 51, 10),
	u('POL-52', 'Comptroller and Auditor General of India', 'CAG', 'institutions', 52, 25),
	u('POL-53', 'Attorney General of India', 'Attorney General', 'institutions', 53, 20),
	u('POL-54', 'Advocate General of the State', 'Advocate General', 'institutions', 54, 10),
	u('POL-56', 'NITI Aayog', 'NITI Aayog', 'institutions', 56, 25),
	u('POL-57', 'National Human Rights Commission', 'NHRC', 'institutions', 57, 25),
	u('POL-58', 'State Human Rights Commission', 'SHRC', 'institutions', 58, 10),
	u('POL-59', 'National Commission for Women', 'NCW', 'institutions', 59, 15),
	u('POL-60', 'National Commission for Protection of Child Rights', 'NCPCR', 'institutions', 60, 10),
	u('POL-61', 'National Commission for Minorities', 'Minorities Comm.', 'institutions', 61, 10),
	u('POL-62', 'Central Information Commission', 'CIC', 'institutions', 62, 20),
	u('POL-63', 'State Information Commission', 'SIC', 'institutions', 63, 10),
	u('POL-64', 'Central Vigilance Commission', 'CVC', 'institutions', 64, 20),
	u('POL-65', 'Central Bureau of Investigation', 'CBI', 'institutions', 65, 20),
	u('POL-66', 'Lokpal and Lokayuktas', 'Lokpal', 'institutions', 66, 20),
	u('POL-67', 'National Investigation Agency', 'NIA', 'institutions', 67, 15),
	u('POL-68', 'National Disaster Management Authority', 'NDMA', 'institutions', 68, 20),
	u('POL-69', 'Bar Council of India', 'Bar Council', 'institutions', 69, 10),
	u('POL-70', 'Law Commission of India', 'Law Commission', 'institutions', 70, 15),
	u('POL-71', 'Delimitation Commission of India', 'Delimitation', 'institutions', 71, 15),
	u('POL-72', 'North Eastern Council', 'NE Council', 'institutions', 72, 10),
	// PARTS IX–XI — Dynamics & Dimensions
	u('POL-73', 'Co-operative Societies', 'Co-op Societies', 'dynamics', 73, 15),
	u('POL-74', 'Official Language', 'Official Language', 'dynamics', 74, 20),
	u('POL-75', 'Public Services', 'Public Services', 'dynamics', 75, 15),
	u('POL-76', 'Rights and Liabilities of the Government', 'Govt. Liabilities', 'dynamics', 76, 10),
	u('POL-77', 'Special Provisions Relating to Certain Classes', 'Special Provisions', 'dynamics', 77, 20),
	u('POL-78', 'Special Provisions for Some States', 'State Provisions', 'dynamics', 78, 15),
	u('POL-79', 'Political Parties', 'Political Parties', 'dynamics', 79, 20),
	u('POL-80', 'Role of Regional Parties', 'Regional Parties', 'dynamics', 80, 10),
	u('POL-81', 'Elections', 'Elections', 'dynamics', 81, 25),
	u('POL-82', 'Election Laws', 'Election Laws', 'dynamics', 82, 20),
	u('POL-83', 'Electoral Reforms', 'Electoral Reforms', 'dynamics', 83, 20),
	u('POL-84', 'Voting Behaviour', 'Voting Behaviour', 'dynamics', 84, 10),
	u('POL-85', 'Coalition Government', 'Coalitions', 'dynamics', 85, 10),
	u('POL-86', 'Anti-Defection Law', 'Anti-Defection', 'dynamics', 86, 25),
	u('POL-87', 'Pressure Groups', 'Pressure Groups', 'dynamics', 87, 15),
	u('POL-88', 'National Integration', 'Natl. Integration', 'dynamics', 88, 10),
	u('POL-89', 'Foreign Policy', 'Foreign Policy', 'dynamics', 89, 20),
	u('POL-90', 'National Commission to Review the Working of the Constitution', 'NCRWC', 'dynamics', 90, 10),
	// PARTS XII–XIII — The Courtroom & The World
	u('POL-91', 'Landmark Judgements and Their Impact', 'Landmark Cases', 'courtroom', 91, 35),
	u('POL-92', 'Judgements Expanding the Scope of Article 21', 'Article 21 Cases', 'courtroom', 92, 25),
	u('POL-93', 'Judgements Relating to the Amendments', 'Amendment Cases', 'courtroom', 93, 20),
	u('POL-94', 'Important Doctrines of Constitutional Interpretation', 'Doctrines', 'courtroom', 94, 20),
	u('POL-95', 'World Constitutions', 'World Constitutions', 'courtroom', 95, 25),
	// APPENDICES — drill banks, attached to their related region (master doc
	// mapping: APX-1 from Phase 1, APX-4 with Foundations, APX-8 with The Centre;
	// the rest follow their subject matter)
	u('APX-1', 'Articles of the Constitution — drills', 'Articles Drill', 'foundations', 901, 60, 'appendix'),
	u('APX-2', 'Union, State and Concurrent List Subjects', 'Lists Drill', 'system', 902, 40, 'appendix'),
	u('APX-3', 'Table of Precedence', 'Precedence Drill', 'centre', 903, 15, 'appendix'),
	u('APX-4', 'Constitutional Amendments at a Glance', 'Amendments Drill', 'foundations', 904, 40, 'appendix'),
	u('APX-5', 'Amendments with Reference to Articles', 'Amend-Articles Drill', 'courtroom', 905, 20, 'appendix'),
	u('APX-6', 'Model Code of Conduct', 'MCC Drill', 'dynamics', 906, 15, 'appendix'),
	u('APX-7', 'Flag Code of India', 'Flag Code Drill', 'dynamics', 907, 10, 'appendix'),
	u('APX-8', 'Presidents, VPs and PMs — Lists', 'Office Lists Drill', 'centre', 908, 25, 'appendix'),
	u('APX-9', 'Chairpersons of National Commissions', 'Chairpersons Drill', 'institutions', 909, 15, 'appendix')
];

export const TOTAL_UNITS = UNITS.length; // 103

/** APX-1 is available from Phase 1 (always); other drills unlock with their region. */
export const ALWAYS_UNLOCKED_DRILLS = new Set(['APX-1']);
