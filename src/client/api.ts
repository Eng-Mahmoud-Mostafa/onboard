export type AuthState = {
  session: { userId: string; email: string } | null;
  profile: { profileId: string; profileName: string; isAdmin: boolean } | null;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Request failed.");
  return payload as T;
}

export function postJson<T>(path: string, body: Record<string, unknown>) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}
