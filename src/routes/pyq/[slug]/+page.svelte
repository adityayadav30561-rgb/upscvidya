<script lang="ts">
	/* Static SEO landing page for one past paper. Deliberately summary-only:
	   counts and a topic breakdown, with a CTA into the live vault. */
	let { data } = $props();
	const p = $derived(data.paper);
	const title = $derived(`${p.exam} AC ${p.year} Polity previous year questions (${p.count} PYQs)`);
	const description = $derived(
		`All ${p.count} Polity questions from the ${p.exam} Assistant Commandant ${p.year} paper, free — ` +
			`covering ${p.topics.map((t) => t.title).slice(0, 3).join(', ')} and more. ` +
			`Attempt them inline with explanations or as a timed past paper.`
	);
</script>

<svelte:head>
	<title>{title} | UPSCVidya</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="https://upscvidya.app/pyq/{p.slug}" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="article" />
</svelte:head>

<article class="landing">
	<nav class="crumb"><a href="/pyq">PYQ Vault</a> · {p.exam} {p.year}</nav>

	<header>
		<span class="free">100% FREE</span>
		<h1>{p.exam} AC {p.year} — Polity Previous Year Questions</h1>
		<p class="lede">
			{p.count} Polity questions from the {p.exam} Assistant Commandant {p.year} paper, with full
			explanations. Attempt them one at a time or sit the whole paper as a timed test.
		</p>
	</header>

	<section class="stats">
		<div class="stat"><div class="sv">{p.count}</div><div class="sk">QUESTIONS</div></div>
		<div class="stat"><div class="sv">{p.topics.length}</div><div class="sk">TOPICS COVERED</div></div>
		<div class="stat"><div class="sv">{p.year}</div><div class="sk">PAPER YEAR</div></div>
	</section>

	<section>
		<h2>Topic breakdown</h2>
		<ul class="breakdown">
			{#each p.topics as t (t.code)}
				<li>
					<span class="bt">{t.title}</span>
					<span class="bc">{t.count} question{t.count === 1 ? '' : 's'}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="cta">
		<a class="cta-btn" href="/pyq">Open the free PYQ Vault →</a>
		<p class="cta-note">
			No signup needed to browse or attempt. Create a free account to track what you've cleared and
			send wrong answers to spaced revision.
		</p>
	</section>

	<section class="about">
		<h2>About the {p.exam} AC Polity section</h2>
		<p>
			Indian Polity is a high-yield section of the CAPF Assistant Commandant General Ability and
			Intelligence paper. Working through past papers is the fastest way to see which articles and
			doctrines actually repeat — UPSCVidya keeps every one of them free, across
			{data.papers} papers and {data.totalQuestions} questions.
		</p>
	</section>
</article>

<style>
	.landing {
		max-width: 680px;
		margin: 0 auto;
		padding: 28px 20px 60px;
		display: flex;
		flex-direction: column;
		gap: 26px;
	}
	.crumb {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
	}
	.crumb a {
		color: var(--blue-deep);
	}
	.free {
		display: inline-block;
		font-size: 10px;
		font-weight: 900;
		background: var(--green);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-sm);
		padding: 3px 9px;
		transform: rotate(-2deg);
	}
	h1 {
		margin: 10px 0 0;
		font-family: var(--font-display);
		font-size: 26px;
		line-height: 1.2;
		text-transform: uppercase;
	}
	h2 {
		margin: 0 0 10px;
		font-family: var(--font-display);
		font-size: 15px;
		text-transform: uppercase;
	}
	.lede {
		margin: 10px 0 0;
		font-family: var(--font-read);
		font-size: 15px;
		line-height: 1.65;
		color: var(--ink-2);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
	}
	.stat {
		background: var(--bg-2);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-lg);
		padding: 14px;
		text-align: center;
	}
	.sv {
		font-family: var(--font-display);
		font-size: 22px;
	}
	.sk {
		font-size: 9px;
		font-weight: 900;
		color: var(--ink-3);
	}
	.breakdown {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.breakdown li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		background: var(--bg-2);
		border: var(--bw) solid var(--line-soft);
		border-radius: var(--r-md);
		padding: 10px 13px;
	}
	.bt {
		font-weight: 900;
		font-size: 13px;
	}
	.bc {
		font-size: 12px;
		color: var(--ink-3);
	}
	.cta {
		text-align: center;
		background: var(--green-tint);
		border: var(--bw-bold) solid var(--line);
		border-radius: var(--r-xl);
		padding: 22px;
	}
	.cta-btn {
		display: inline-block;
		font-family: var(--font-ui);
		font-weight: 900;
		font-size: 15px;
		background: var(--orange);
		color: var(--ink-1);
		border: var(--bw) solid var(--line);
		border-radius: var(--r-full);
		padding: 13px 26px;
		text-decoration: none;
		box-shadow: var(--shadow-2);
	}
	.cta-note {
		margin: 12px 0 0;
		font-size: 12px;
		color: var(--ink-2);
	}
	.about p {
		margin: 0;
		font-family: var(--font-read);
		font-size: 14.5px;
		line-height: 1.7;
		color: var(--ink-2);
	}
</style>
