import { z } from 'zod';
import { assistantRequest, foodUnits, mealDraftSchema } from '@/domain/nutrition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const responseSchema = {
  type: 'object',
  required: ['title', 'items'],
  properties: {
    title: { type: 'string' },
    items: {
      type: 'array', maxItems: 12,
      items: {
        type: 'object', required: ['name', 'amount', 'unit'],
        properties: {
          name: { type: 'string' }, amount: { type: ['number', 'null'] },
          unit: { anyOf: [{ type: 'string', enum: foodUnits }, { type: 'null' }] },
        },
      },
    },
  },
};

const envelope = z.object({ candidates: z.array(z.object({
  content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional(),
  finishReason: z.string().optional(),
})).optional() });

const noCache = { 'Cache-Control': 'no-store' };
const requestTimes: number[] = [];

function releaseSlot() {
  const now = Date.now();
  while (requestTimes.length && requestTimes[0] <= now - 60_000) requestTimes.shift();
  if (requestTimes.length >= 8) return false;
  requestTimes.push(now);
  return true;
}

function reply(data: object, status = 200) {
  return Response.json(data, { status, headers: noCache });
}

export function GET() {
  return reply({ enabled: Boolean(process.env.GEMINI_API_KEY?.trim()) });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  while (true) {
    const part = await reader.read();
    if (part.done) return JSON.parse(text + decoder.decode()) as unknown;
    size += part.value.length;
    if (size > 4096) { await reader.cancel(); return null; }
    text += decoder.decode(part.value, { stream: true });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if ((origin && origin !== new URL(request.url).origin) || (site && site !== 'same-origin')) {
    return reply({ error: 'Open the meal assistant in LiftLog.' }, 403);
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return reply({ error: 'Gemini setup is pending. You can draft a logged meal offline.' }, 503);
  const value = await readBody(request).catch(() => null);
  const parsed = assistantRequest.safeParse(value);
  if (!parsed.success) return reply({ error: 'Enter a short meal description or request.' }, 400);
  if (!releaseSlot()) return reply({ error: 'Meal assistant limit reached. Try again in a minute.' }, 429);

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(model)) return reply({ error: 'Check the server’s Gemini model setting.' }, 503);
  const instructions = [
    'You produce short food and portion drafts for a food journal. Only fill the requested schema.',
    'Return ingredient or dish names and suggested portions. Prefer familiar English or Indian food names and use grams when planning.',
    'Use piece for individually countable foods, and g, katori, glass, cup, tbsp, tsp or serving as appropriate.',
    'Use null for unknown amounts or units. Never include calorie or macro numbers, health advice, or commentary.',
    parsed.data.mode === 'log'
      ? 'Extract only foods actually mentioned. Keep stated quantities. Do not infer missing amounts or add ingredients.'
      : 'Suggest a single ordinary meal. Respect the stated ingredients and food preferences. Include cooking oils and sides if used. Do not claim to meet numerical nutrient or medical targets.',
  ].join(' ');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: parsed.data.text }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: responseSchema, maxOutputTokens: 1200 },
      }),
    });
    if (response.status === 429) return reply({ error: 'Gemini’s request limit was reached. Try again shortly.' }, 429);
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return reply({ error: 'Gemini is unavailable. Check the key and model on the server.' }, 503);
    }
    if (!response.ok) return reply({ error: 'Gemini is temporarily unavailable. Try again or log the meal offline.' }, 502);
    const candidate = envelope.safeParse(await response.json());
    const first = candidate.success ? candidate.data.candidates?.[0] : undefined;
    const output = first?.content?.parts.filter((part) => !part.thought).map((part) => part.text ?? '').join('') ?? '';
    if (!output || (first?.finishReason && first.finishReason !== 'STOP')) {
      return reply({ error: 'Gemini couldn’t finish a meal draft. Try a shorter request.' }, 422);
    }
    const draft = mealDraftSchema.safeParse(JSON.parse(output));
    return draft.success ? reply(draft.data) : reply({ error: 'Gemini returned an incomplete meal draft. Try again.' }, 422);
  } catch {
    return reply({ error: 'Couldn’t get a Gemini meal draft. Try again or log foods directly.' }, 502);
  }
}
