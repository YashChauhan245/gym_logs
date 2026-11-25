import { dayLabel, gymLogoSchema, money, type GymMembership, type GymPayment, type GymSettings } from './gym';
import type { Correction } from './gym-activity';

const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function gymReceipt(payment: GymPayment, member: string, settings?: GymSettings, membership?: GymMembership, correction?: Correction) {
  const gym = escapeHtml(settings?.name ?? 'Your gym');
  const logo = gymLogoSchema.safeParse(settings?.logo);
  const rows = [
    ['Receipt number', payment.id], ['Member', member], ['Date received', dayLabel(payment.paidOn)],
    ['Payment method', payment.method], ['Reference', payment.reference],
    ['Membership', membership?.planName ?? ''],
    ['Membership period', membership ? `${dayLabel(membership.startDate)} – ${dayLabel(membership.endDate)}` : ''],
  ];
  if (correction) rows.push(['Original amount', money(payment.amountMinor)], ['Correction reason', correction.reason]);
  const title = correction ? correction.amountMinor ? 'Corrected payment receipt' : 'Voided payment receipt' : 'Payment receipt';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${gym} · ${title}</title>
<style>
  * { box-sizing: border-box; } body { margin: 0; color: #22221e; background: #f5f2ea; font: 16px system-ui,sans-serif; }
  main { width: min(calc(100% - 2rem), 46rem); margin: 2rem auto; padding: clamp(1.25rem,5vw,3rem); background: #fff; border: 1px solid #d7cfbf; border-top: 5px solid #ad8950; }
  header { display: flex; align-items: center; gap: 1rem; } img { width: 76px; height: 64px; object-fit: contain; } h1,h2,p,dd { margin: 0; }
  .gym { font-weight: 750; font-size: 1.15rem; overflow-wrap: anywhere; } h1 { margin-top: 2rem; font-size: 1.9rem; }
  .amount { font-size: 2.2rem; font-weight: 700; margin-top: .25rem; } dl { margin-bottom: 0; }
  .detail { display: grid; grid-template-columns: .9fr 1.3fr; gap: .75rem; border-top: 1px solid #e5dfd2; padding: .65rem 0; }
  dt, .contact { color: #58544c; } dd { overflow-wrap: anywhere; } @media print { body { background: #fff; } main { margin: 0; width: 100%; } }
</style></head><body><main>
  <header>${logo.success ? `<img src="${escapeHtml(logo.data)}" alt="">` : ''}<div><p class="gym">${gym}</p>${settings?.phone ? `<p class="contact">${escapeHtml(settings.phone)}</p>` : ''}</div></header>
  <h1>${title}</h1><p class="amount">${money(correction?.amountMinor ?? payment.amountMinor)}</p>
  <dl>${rows.filter(([, value]) => value).map(([label, value]) => `<div class="detail"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
</main></body></html>`;
}
