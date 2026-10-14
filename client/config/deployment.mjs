/** Public build settings shared by Vite and deployment checks. */
export function clientDeployment(env, pages = false) {
  const base = env.VITE_BASE_PATH || './';
  if (
    base !== './' &&
    !(base.startsWith('/') && !base.startsWith('//') && base.endsWith('/') && !/[?#\\]/.test(base))
  ) {
    throw new Error(
      'VITE_BASE_PATH must be ./ or a site path with leading and trailing slashes, such as /Deadware/.',
    );
  }
  const apiUrl = env.VITE_API_URL || '';
  if (pages && !apiUrl)
    throw new Error(
      'Set the GitHub Actions repository variable VITE_API_URL to your public HTTPS API origin before deploying Pages.',
    );
  if (apiUrl) {
    let url;
    try {
      url = new URL(apiUrl);
    } catch {
      throw new Error('VITE_API_URL must be an API origin, such as https://api.example.com.');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== apiUrl ||
      url.username ||
      url.password ||
      (pages && url.protocol !== 'https:')
    ) {
      throw new Error(
        'VITE_API_URL must be an HTTP(S) origin without a path, credentials or trailing slash; GitHub Pages requires HTTPS.',
      );
    }
  }
  return { base, apiUrl };
}
