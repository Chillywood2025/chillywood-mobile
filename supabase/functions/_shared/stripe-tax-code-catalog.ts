// GET-only provider taxonomy. A code/name is NOT a legal classification,
// registration, account capability or collection qualification.
export async function readTaxCatalogText(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
  if (!body) return '';
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength; if (total > maxBytes) throw Error('tax_catalog_size_limit');
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const combined = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(combined);
}
export async function readStripeTaxCodeCatalog(key: string, accountId: string, startingAfter?: string, fetcher: typeof fetch = fetch) {
  if (!/^(?:sk|rk)_live_[A-Za-z0-9_]+$/.test(key) || !/^acct_[A-Za-z0-9]+$/.test(accountId)
    || (startingAfter !== undefined && !/^txcd_[0-9]+$/.test(startingAfter))) throw Error('tax_catalog_config_invalid');
  const get = async (path: string) => {
    const response = await fetcher(`https://api.stripe.com${path}`, { method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2026-10-28.endive' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('tax_catalog_provider_unavailable');
    const text = await readTaxCatalogText(response.body, 1_000_000);
    return JSON.parse(text);
  };
  const account = await get('/v1/account');
  if (account.id !== accountId || account.object !== 'account') throw Error('tax_catalog_account_mismatch');
  const page = await get(`/v1/tax_codes?limit=100${startingAfter ? `&starting_after=${encodeURIComponent(startingAfter)}` : ''}`);
  if (page.object !== 'list' || page.url !== '/v1/tax_codes' || !Array.isArray(page.data)
    || page.data.length > 100 || typeof page.has_more !== 'boolean') throw Error('tax_catalog_response_invalid');
  const seen = new Set<string>();
  const codes = page.data.map((item: Record<string, unknown>) => {
    if (!item || item.object !== 'tax_code' || typeof item.id !== 'string' || !/^txcd_[0-9]+$/.test(item.id)
      || item.id === startingAfter || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 300
      || typeof item.description !== 'string' || item.description.length > 10000) throw Error('tax_catalog_response_invalid');
    seen.add(item.id);
    const requirements = item.requirements as Record<string, unknown> | undefined;
    const supported = requirements === undefined || (requirements !== null && typeof requirements === 'object' && !Array.isArray(requirements)
      && Object.keys(requirements).every(k => k === 'performance_location')
      && (requirements.performance_location === undefined || requirements.performance_location === 'optional'));
    return { id: item.id, name: item.name, description: item.description, supported };
  });
  if (page.has_more && !codes.length) throw Error('tax_catalog_cursor_invalid');
  return { codes, hasMore: page.has_more as boolean, nextCursor: page.has_more ? codes.at(-1)!.id : null, providerReady: false as const };
}
