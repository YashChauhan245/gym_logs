import { addDays, amountMinor, gymMemberSchema, gymMembershipSchema, gymPlanSchema, type GymMember, type GymPlan } from './gym';

export const gymImportTemplate = 'Name,Phone,Email,Trainer,Notes,Plan,Start,End,Fee INR,Outstanding INR,Duration days\r\n';
const maxRows = 1_000;
const normalize = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
const memberInput = gymMemberSchema.omit({ id: true, createdAt: true });
const headerAliases = {
  name: ['name', 'member name', 'full name'], phone: ['phone', 'mobile', 'phone number'], email: ['email', 'email address'],
  trainer: ['trainer', 'assigned trainer'], notes: ['notes'], status: ['status'], plan: ['plan', 'plan name', 'membership plan'],
  start: ['start', 'start date', 'membership start'], end: ['end', 'end date', 'expiry', 'expiry date', 'expiration date'],
  fee: ['fee inr', 'fee', 'plan fee'], outstanding: ['outstanding inr', 'outstanding balance', 'balance due'],
  duration: ['duration days', 'plan duration days'],
} as const;

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const pushField = () => { cells.push(field.trim()); field = ''; closed = false; };
  const pushRow = () => {
    pushField();
    if (cells.some(Boolean)) rows.push(cells);
    cells = [];
    if (rows.length > maxRows + 1) throw new Error(`A file can contain up to ${maxRows} member records.`);
  };
  const source = csv.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') { field += '"'; index++; }
      else { quoted = false; closed = true; }
    } else if (char === ',') {
      pushField();
    } else if (char === '\r' || char === '\n') {
      pushRow();
      if (char === '\r' && source[index + 1] === '\n') index++;
    } else if (char === '"' && !field.trim() && !closed) {
      field = '';
      quoted = true;
    } else if (char === '"' || closed && !/\s/.test(char)) {
      throw new Error(`Unexpected text after quotes in CSV record ${rows.length + 1}.`);
    } else if (!closed) field += char;
  }
  if (quoted) throw new Error(`Unclosed quote in CSV record ${rows.length + 1}.`);
  pushRow();
  return rows;
}

type PlanChoice = { id?: string; name: string; durationDays: number; feeMinor: number };
export type ImportMember = {
  row: number; member: Omit<GymMember, 'id' | 'createdAt'>;
  membership?: { plan: PlanChoice; startDate: string; endDate: string; feeMinor: number; openingPaidMinor: number };
};
export type ImportIssue = { row: number; name: string; status: 'Duplicate' | 'Invalid'; reason: string };

function contactKeys(member: Pick<GymMember, 'email' | 'phone'>) {
  const phone = member.phone.replace(/\D/g, '');
  return [...(member.email ? [`email:${member.email.toLowerCase()}`] : []), ...(phone ? [`phone:${phone}`] : [])];
}

export function reviewGymCsv(csv: string, existingMembers: GymMember[], existingPlans: GymPlan[]) {
  if (csv.length > 1_000_000) throw new Error('Choose a CSV file under 1 MB.');
  const [header, ...rows] = parseCsv(csv);
  if (!header || !rows.length) throw new Error('Add a header and at least one member row.');
  const columns = Object.fromEntries(Object.entries(headerAliases).map(([key, aliases]) => {
    const matches = header.map(normalize).flatMap((label, index) => aliases.some((alias) => alias === label) ? [index] : []);
    if (matches.length > 1) throw new Error(`The CSV has more than one ${aliases[0]} column.`);
    return [key, matches[0] ?? -1];
  })) as Record<keyof typeof headerAliases, number>;
  if (columns.name < 0) throw new Error('The CSV needs a Name column.');

  const records: ImportMember[] = [];
  const issues: ImportIssue[] = [];
  const contacts = new Set(existingMembers.flatMap(contactKeys));
  const names = new Set(existingMembers.map((member) => normalize(member.name)));
  const newPlans = new Map<string, PlanChoice>();

  rows.forEach((cells, index) => {
    const row = index + 2;
    const field = (key: keyof typeof columns) => cells[columns[key]] ?? '';
    const name = field('name');
    try {
      if (cells.length > header.length) throw new Error('This row has more columns than the header. Put commas inside quotes.');
      const member = memberInput.safeParse({ name, phone: field('phone').replace(/^'(?=\+)/, ''), email: field('email'),
        trainer: field('trainer'), notes: field('notes'), archived: normalize(field('status')) === 'archived' });
      if (!member.success) throw new Error(`Check the ${String(member.error.issues[0]?.path[0] ?? 'member')} field.`);
      const keys = contactKeys(member.data);
      if (keys.some((key) => contacts.has(key)) || !keys.length && names.has(normalize(name))) {
        issues.push({ row, name, status: 'Duplicate', reason: 'Matches an earlier row or an existing member.' });
        return;
      }

      const record: ImportMember = { row, member: member.data };
      const planName = field('plan');
      if ([planName, field('start'), field('end'), field('fee'), field('outstanding'), field('duration')].some(Boolean)) {
        if (!planName) throw new Error('Enter a plan name for this membership.');
        const matches = existingPlans.filter((plan) => normalize(plan.name) === normalize(planName));
        if (matches.length > 1) throw new Error('More than one existing plan uses this name. Use a unique plan name.');
        const planKey = normalize(planName);
        const alreadyProposed = newPlans.get(planKey);
        const plan = matches[0] ?? alreadyProposed ?? gymPlanSchema.parse({ id: 'new-plan', name: planName,
          durationDays: Number(field('duration')), feeMinor: amountMinor(field('fee')), active: true });
        const feeMinor = field('fee') ? amountMinor(field('fee')) : plan.feeMinor;
        const outstanding = field('outstanding') ? amountMinor(field('outstanding')) : 0;
        if (outstanding > feeMinor) throw new Error('Outstanding INR exceeds the fee for this membership.');
        const startDate = field('start');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Enter a start date as YYYY-MM-DD.');
        const endDate = field('end') || addDays(startDate, plan.durationDays - 1);
        const period = gymMembershipSchema.safeParse({ id: 'import', memberId: 'import', planId: 'import', planName: plan.name,
          startDate, endDate, feeMinor, openingPaidMinor: feeMinor - outstanding, createdAt: 0 });
        if (!period.success) throw new Error('Check the start date, end date and membership fee.');
        const choice = { id: matches[0]?.id, name: plan.name, durationDays: plan.durationDays, feeMinor: plan.feeMinor };
        if (!matches.length) {
          if (alreadyProposed && field('duration') && Number(field('duration')) !== choice.durationDays) throw new Error('This new plan has a conflicting duration.');
          newPlans.set(planKey, choice);
        }
        record.membership = { plan: choice, startDate, endDate, feeMinor, openingPaidMinor: feeMinor - outstanding };
      }
      for (const key of keys) contacts.add(key);
      names.add(normalize(name));
      records.push(record);
    } catch (error) {
      const reason = error instanceof Error && error.name !== 'ZodError' ? error.message : 'A new plan needs a valid Fee INR and Duration days.';
      issues.push({ row, name, status: 'Invalid', reason });
    }
  });
  return { records, issues, newPlanCount: newPlans.size };
}
