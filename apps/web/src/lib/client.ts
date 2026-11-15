export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new HttpError(response.status, message);
  }
  return data as T;
}

export function getJson<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { cache: "no-store" });
}

export function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status >= 500 || error.status === 429;
  return true;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
