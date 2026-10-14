const args = process.argv.slice(2),
  value = (name) => args[args.indexOf(name) + 1];
const raw = args.includes('--api') ? value('--api') : process.env.PUBLIC_API_ORIGIN;
const client = args.includes('--client') ? value('--client') : process.env.CLIENT_ORIGIN;
try {
  if (!raw || !client)
    throw new Error('Supply --api https://api.your-domain and --client https://your-pages-origin.');
  const api = new URL(raw),
    clientUrl = new URL(client),
    origin = clientUrl.origin;
  if (
    api.origin !== raw ||
    api.protocol !== 'https:' ||
    api.username ||
    api.password ||
    clientUrl.username ||
    clientUrl.password ||
    clientUrl.protocol !== 'https:'
  )
    throw new Error('Use public HTTPS API and client addresses, without API paths or credentials.');
  const headers = { Origin: origin };
  const health = await fetch(raw + '/api/health', { headers, signal: AbortSignal.timeout(10000) });
  if (health.status !== 200 || (await health.json()).status !== 'ready')
    throw new Error('API readiness failed. Check the service, database and proxy.');
  const preflight = await fetch(raw + '/api/auth/login', {
    method: 'OPTIONS',
    headers: {
      ...headers,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-deadware-client',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (
    preflight.status !== 204 ||
    preflight.headers.get('access-control-allow-origin') !== origin ||
    preflight.headers.get('access-control-allow-credentials') !== 'true'
  )
    throw new Error('API CORS does not match the client origin and credential settings.');
  const me = await fetch(raw + '/api/me', { headers, signal: AbortSignal.timeout(10000) });
  if (me.status !== 401) throw new Error('Private API did not require authentication.');
  if (!args.includes('--api-only')) {
    const site = await fetch(client, { signal: AbortSignal.timeout(10000) });
    if (!site.ok || !site.headers.get('content-type')?.includes('text/html'))
      throw new Error('Client site is not serving HTML at that address.');
  }
  console.log('PASS Public HTTPS API readiness, CORS and unauthenticated access restrictions.');
  console.log(
    'INFO Complete a browser registration/login check to verify cookie behavior for these domains.',
  );
} catch (error) {
  console.error(
    'FAIL ' +
      (error instanceof TypeError
        ? 'Could not reach the configured HTTPS endpoint. Check DNS, TLS and the firewall.'
        : error.message),
  );
  process.exitCode = 1;
}
