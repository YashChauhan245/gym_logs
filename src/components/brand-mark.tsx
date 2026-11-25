import Image from 'next/image';

export function BrandMark() {
  return <span className="app-mark app-logo"><Image src="/icons/liftlog-192.png" width={36} height={36} alt="" unoptimized /></span>;
}
