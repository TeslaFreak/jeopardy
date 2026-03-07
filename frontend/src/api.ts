/**
 * Thin wrapper around fetch that adds the Cognito JWT Authorization header.
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { API_URL } from './amplify-config';

async function authHeaders(): Promise<HeadersInit> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
