/** Generates the PWA PNG icon set from static/icons/mark.svg (sharp). */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('static/icons/mark.svg');

const jobs = [
	{ out: 'static/icons/icon-192.png', size: 192, pad: 0 },
	{ out: 'static/icons/icon-512.png', size: 512, pad: 0 },
	// maskable: mark shrunk into the 80% safe zone on solid paper
	{ out: 'static/icons/maskable-512.png', size: 512, pad: 64 },
	{ out: 'static/icons/icon-180.png', size: 180, pad: 0 } // apple-touch
];

for (const { out, size, pad } of jobs) {
	const inner = size - pad * 2;
	let img = sharp(svg).resize(inner, inner);
	if (pad > 0) {
		img = sharp({
			create: { width: size, height: size, channels: 4, background: '#f3ecdc' }
		}).composite([{ input: await sharp(svg).resize(inner, inner).png().toBuffer(), top: pad, left: pad }]);
	}
	await img.png().toFile(out);
	console.log(`${out} (${size}x${size})`);
}
