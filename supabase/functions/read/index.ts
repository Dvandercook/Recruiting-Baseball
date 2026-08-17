// Supabase Edge Function — the reader service.
//
// The board needs a model to read screenshots and handwritten books. Calling
// Anthropic straight from the page would mean putting an API key in a file
// that's on the public internet, so instead the page calls this, and this
// holds the key.
//
// Supabase verifies the caller's JWT before this function ever runs, so only
// coaches who are signed in to your board can spend your API credits.
//
// Deploy:
//   supabase functions deploy read
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Or paste this into the dashboard: Edge Functions → Deploy a new function,
// name it "read", then add the secret under Edge Functions → Secrets.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5'];
const MAX_TOKENS_CAP = 8000;

const cors = {
  'Access-Control-Allow-Origin': '*',        // tighten to your app's URL once it's hosted
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set on this function' }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body was not JSON' }, 400);
  }

  // Only pass through what the board actually sends, and cap it. Without this
  // a signed-in account could be talked into running anything at your expense.
  const model = typeof body.model === 'string' && ALLOWED_MODELS.includes(body.model)
    ? body.model : ALLOWED_MODELS[0];
  const max_tokens = Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP);
  if (!Array.isArray(body.messages)) return json({ error: 'messages must be an array' }, 400);

  const payload = {
    model,
    max_tokens,
    ...(typeof body.system === 'string' ? { system: body.system } : {}),
    messages: body.messages,
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
