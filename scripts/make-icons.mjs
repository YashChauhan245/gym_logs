import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

await mkdir('public/icons', { recursive: true });
for (const [name, size, maskable] of [['192', 192, false], ['512', 512, false], ['maskable', 512, true], ['apple', 180, true]]) {
  const background = maskable ? '#151513' : 'transparent';
  const inset = maskable ? 58 : 12;
  const tile = 512 - inset * 2;
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <path fill="${background}" d="M0 0h512v512H0z"/>
    <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="94" fill="#e8bf65"/>
    <g transform="rotate(-28 256 256)" fill="#21180b">
      <rect x="170" y="242" width="172" height="28" rx="14"/>
      <rect x="155" y="188" width="43" height="136" rx="12"/><rect x="314" y="188" width="43" height="136" rx="12"/>
      <rect x="124" y="210" width="25" height="92" rx="10"/><rect x="363" y="210" width="25" height="92" rx="10"/>
    </g></svg>`;
  await sharp(Buffer.from(icon)).resize(size).png().toFile(`public/icons/liftlog-${name}.png`);
}
