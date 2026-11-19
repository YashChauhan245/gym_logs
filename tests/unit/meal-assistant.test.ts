import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/meal-assistant/route';

const url = 'http://localhost:3210/api/meal-assistant';
function request(value: object, origin = 'http://localhost:3210') {
  return new Request(url, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Gemini meal assistant', () => {
  it('reports setup pending and returns a safe response when the key is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(await GET().json()).toEqual({ enabled: false });
    expect((await POST(request({ mode: 'log', text: '2 rotis' }))).status).toBe(503);
  });

  it('blocks cross-origin requests and validates input before contacting Google', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect((await POST(request({ mode: 'log', text: '2 rotis' }, 'https://example.invalid'))).status).toBe(403);
    expect((await POST(request({ mode: 'log', text: 'a'.repeat(651) }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends a structured food-only draft request and ignores provider nutrient numbers', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash-lite');
    const payload = { title: 'Lunch', items: [{ name: 'Dal', amount: 1, unit: 'katori', kcal: 1 }] };
    const fetcher = vi.fn(async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'internal' }, { text: JSON.stringify(payload) }] } }] }));
    vi.stubGlobal('fetch', fetcher);
    const response = await POST(request({ mode: 'plan', text: 'Make me a lunch with dal' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: 'Lunch', items: [{ name: 'Dal', amount: 1, unit: 'katori' }] });
    expect(fetcher).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }), cache: 'no-store' }));
  });

  it('returns quota and incomplete-output failures without surfacing provider payloads', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ provider: 'private error' }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }));
    vi.stubGlobal('fetch', fetcher);
    const quota = await POST(request({ mode: 'log', text: '1 katori dal' }));
    expect(quota.status).toBe(429);
    expect(await quota.text()).not.toContain('private error');
    expect((await POST(request({ mode: 'log', text: '1 katori dal' }))).status).toBe(422);
  });
});
