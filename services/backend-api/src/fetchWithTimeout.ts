export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
