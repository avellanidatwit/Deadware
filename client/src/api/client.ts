const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function request<T>(path: string, method = 'GET', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    method, credentials: 'include',
    headers: { 'X-Deadware-Client': 'web', ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
    body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error ?? data.errors?.map((e: { line?: number; message: string }) => `${e.line ? `Line ${e.line}: ` : ''}${e.message}`).join('\n') ?? 'Request failed.', response.status);
  return data as T;
}
