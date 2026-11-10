const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const encoded = /^[A-Za-z0-9_-]{43}$/;

export class RegisterSpace {
  constructor(state) { this.state = state; }

  async fetch(request) {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!token || !encoded.test(token)) return json({ error: 'unauthorized' }, 401);
    const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (request.method === 'GET') {
      const record = await this.state.storage.get('snapshot');
      if (!record) return json({ error: 'not_found' }, 404);
      if (record.tokenHash !== tokenHash) return json({ error: 'unauthorized' }, 401);
      return json({ revision: record.revision, envelope: record.envelope });
    }
    if (request.method !== 'PUT') return json({ error: 'method_not_allowed' }, 405);
    let input;
    try {
      const content = await request.text();
      if (content.length > 870000) return json({ error: 'too_large' }, 413);
      input = JSON.parse(content);
    } catch { return json({ error: 'invalid_json' }, 400); }
    const envelope = input?.envelope;
    if (!Number.isSafeInteger(input?.expectedRevision) || input.expectedRevision < 0 || envelope?.version !== 1 || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) || typeof envelope.ciphertext !== 'string' || !/^[A-Za-z0-9_-]{22,850000}$/.test(envelope.ciphertext)) return json({ error: 'invalid_snapshot' }, 400);
    return this.state.storage.transaction(async transaction => {
      const record = await transaction.get('snapshot');
      if (record && record.tokenHash !== tokenHash) return json({ error: 'unauthorized' }, 401);
      if ((record?.revision || 0) !== input.expectedRevision) return json({ error: 'revision_conflict', revision: record?.revision || 0 }, 409);
      const revision = input.expectedRevision + 1;
      await transaction.put('snapshot', { tokenHash, revision, envelope });
      return json({ revision }, record ? 200 : 201);
    });
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return json({ error: 'origin_not_allowed' }, 403);
    const cors = new Headers({ 'Access-Control-Allow-Origin': origin || allowed[0] || 'null', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return new Response(JSON.stringify({ service: 'inn-encrypted-sync', version: 1 }), { headers: { ...Object.fromEntries(cors), 'Content-Type': 'application/json' } });
    const match = /^\/v1\/spaces\/([A-Za-z0-9_-]{43})$/.exec(url.pathname);
    if (!match) return json({ error: 'not_found' }, 404);
    const response = await env.SPACES.get(env.SPACES.idFromName(match[1])).fetch(request);
    const headers = new Headers(response.headers); cors.forEach((value, name) => headers.set(name, value));
    return new Response(response.body, { status: response.status, headers });
  }
};
