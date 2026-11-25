import { Building2 } from 'lucide-react';
import { gymLogoSchema } from '@/domain/gym';

export function GymMark({ logo }: { logo?: string }) {
  return <span className="gym-mark" aria-hidden="true">{logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" />
  ) : <Building2 size={24} strokeWidth={1.65} />}</span>;
}

export async function readGymLogo(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) {
    throw new Error('Choose a PNG, JPEG or WebP image under 5 MB.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('This image could not be opened. Choose another logo.'); }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not resize the logo.');
    for (const size of [192, 144, 96, 64]) {
      const scale = Math.min(size / Math.max(image.naturalWidth, image.naturalHeight), 1);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = gymLogoSchema.safeParse(canvas.toDataURL('image/webp', .82));
      if (result.success) return result.data;
    }
    throw new Error('This logo could not be reduced to a size that can sync. Try a smaller image.');
  } finally { URL.revokeObjectURL(url); }
}
