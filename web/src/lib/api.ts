const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY as string | undefined;

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});

  if (ADMIN_API_KEY) {
    headers.set("x-admin-api-key", ADMIN_API_KEY);
  }

  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
