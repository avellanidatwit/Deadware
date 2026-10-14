import { ApiError, decodeResponse } from './response.js';
export { ApiError } from './response.js';
const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export async function request<T>(
  path: string,
  method = 'GET',
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const readOnly = method === 'GET' || method === 'HEAD';
  let response: Response;
  try {
    response = await fetch(`${base}/api${path}`, {
      method,
      credentials: 'include',
      headers: readOnly ? {} : { 'X-Deadware-Client': 'web', 'Content-Type': 'application/json' },
      body: readOnly ? undefined : JSON.stringify(body ?? {}),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Could not reach the game server. Check your connection and try again.', 0);
  }
  return decodeResponse<T>(await response.text(), response.status, response.ok);
}
