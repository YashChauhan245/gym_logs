import sharp from 'sharp';

const master = 'public/icons/liftlog-mark.webp';
for (const [name, size] of [['192', 192], ['512', 512], ['maskable', 512], ['apple', 180]]) {
  await sharp(master).resize(size, size).png().toFile(`public/icons/liftlog-${name}.png`);
}
