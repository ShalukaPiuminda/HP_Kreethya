import type { AuthUser } from './auth-types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008/api';

interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  errors?: Record<string, string[]>;
}

class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  data?: unknown;

  constructor(
    message: string,
    status = 0,
    errors?: Record<string, string[]>,
    data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.data = data;
  }
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred.'
) {
  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }

  return toUserFriendlyErrorMessage(error.message, fallback);
}

function toUserFriendlyErrorMessage(
  message: string,
  fallback: string
): string {
  const normalizedMessage = message.trim();
  const lowerMessage = normalizedMessage.toLowerCase();

  if (
    lowerMessage.includes('cannot connect to the erp api') ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('networkerror') ||
    lowerMessage.includes('network request failed')
  ) {
    return 'We could not connect right now. Please try again in a moment.';
  }

  if (
    lowerMessage.includes('returned an invalid response') ||
    lowerMessage.includes('unexpected token <') ||
    lowerMessage.includes('<!doctype html') ||
    lowerMessage.includes('<html')
  ) {
    return 'We could not complete your request right now. Please try again shortly.';
  }

  if (lowerMessage.includes('session expired')) {
    return 'Your session has expired. Please sign in again.';
  }

  if (
    lowerMessage.includes('frontend api url matches its port') ||
    lowerMessage.includes('laravel api is running')
  ) {
    return 'We could not connect right now. Please try again in a moment.';
  }

  if (/https?:\/\//i.test(normalizedMessage)) {
    return fallback;
  }

  return normalizedMessage;
}

class ApiClient {
  private tokenKey = 'auth_token';

  constructor(private baseUrl: string) {}

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string) {
    localStorage.setItem(this.tokenKey, token);
  }

  clearToken() {
    localStorage.removeItem(this.tokenKey);
  }

  private handleUnauthorized() {
    if (typeof window === 'undefined') return;

    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== '/login') {
      sessionStorage.setItem('redirect_after_login', currentPath);
    }

    this.clearToken();
    window.location.href = '/login';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown> | FormData
  ): Promise<ApiResponse<T>> {
    const isForm = body instanceof FormData;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    // FormData sets its own multipart Content-Type (with the boundary).
    if (!isForm) headers['Content-Type'] = 'application/json';

    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: isForm ? body : body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(
        `Cannot connect to the ERP API at ${this.baseUrl}. Check that the Laravel API is running and the frontend API URL matches its port.`
      );
    }

    const rawBody = await response.text();
    let data: ApiResponse<T>;

    try {
      data = rawBody
        ? (JSON.parse(rawBody) as ApiResponse<T>)
        : {
            success: response.ok,
            message: response.ok ? 'Request completed.' : 'Request failed.',
          };
    } catch {
      throw new ApiError(
        `The ERP API returned an invalid response (${response.status}).`,
        response.status,
        undefined,
        rawBody
      );
    }

    if (response.status === 401) {
      this.handleUnauthorized();
      throw new ApiError('Session expired. Redirecting to login.', 401);
    }

    if (!response.ok) {
      const firstError = data.errors
        ? Object.values(data.errors).find((messages) => messages.length > 0)?.[0]
        : undefined;

      throw new ApiError(
        firstError || data.message || 'Request failed.',
        response.status,
        data.errors,
        data
      );
    }

    return data;
  }

  /** `login` is a username or an email address. */
  async login(login: string, password: string) {
    const response = await this.request<{
      user: AuthUser;
      token: string;
      token_type: string;
    }>('POST', '/v1/login', { login, password, device_name: 'web' });

    if (response.success && response.data) {
      this.setToken(response.data.token);
    }

    return response;
  }

  async logout() {
    try {
      await this.request('POST', '/v1/logout');
    } finally {
      this.clearToken();
    }
  }

  async getUser() {
    return this.request<AuthUser>('GET', '/v1/user');
  }

  async get<T = unknown>(path: string) {
    return this.request<T>('GET', path);
  }

  async getAll<T = unknown>(path: string, perPage = 100) {
    const allRecords: T[] = [];
    let page = 1;
    let lastResponse: ApiResponse<T[]> | null = null;

    do {
      const separator = path.includes('?') ? '&' : '?';
      const response = await this.request<T[]>(
        'GET',
        `${path}${separator}page=${page}&per_page=${perPage}`
      );

      allRecords.push(...(response.data || []));
      lastResponse = response;
      page += 1;
    } while (lastResponse.meta && page <= lastResponse.meta.last_page);

    return {
      ...(lastResponse || {
        success: true,
        message: 'Records retrieved successfully.',
      }),
      data: allRecords,
    } as ApiResponse<T[]>;
  }

  async post<T = unknown>(path: string, body: Record<string, unknown>) {
    return this.request<T>('POST', path, body);
  }

  /** POST multipart form data (file uploads). */
  async postForm<T = unknown>(path: string, form: FormData) {
    return this.request<T>('POST', path, form);
  }

  async put<T = unknown>(path: string, body: Record<string, unknown>) {
    return this.request<T>('PUT', path, body);
  }

  async patch<T = unknown>(path: string, body: Record<string, unknown>) {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T = unknown>(path: string) {
    return this.request<T>('DELETE', path);
  }

  async download(path: string, fallbackFilename?: string) {
    return this.downloadRequest('GET', path, undefined, fallbackFilename);
  }

  /** Like download(), but POSTs a JSON body (e.g. an unsaved report definition). */
  async downloadPost(path: string, body: Record<string, unknown>, fallbackFilename?: string) {
    return this.downloadRequest('POST', path, body, fallbackFilename);
  }

  private async downloadRequest(
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown> | undefined,
    fallbackFilename?: string
  ) {
    const headers: Record<string, string> = {
      Accept: 'application/octet-stream',
    };
    if (body) headers['Content-Type'] = 'application/json';

    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(
        `Cannot connect to the ERP API at ${this.baseUrl}. Check that the Laravel API is running and the frontend API URL matches its port.`
      );
    }

    if (response.status === 401) {
      this.handleUnauthorized();
      throw new ApiError('Session expired. Redirecting to login.', 401);
    }

    if (!response.ok) {
      const rawBody = await response.text();

      try {
        const data = rawBody ? (JSON.parse(rawBody) as ApiResponse) : null;
        const firstError = data?.errors
          ? Object.values(data.errors).find((messages) => messages.length > 0)?.[0]
          : undefined;
        throw new ApiError(
          firstError || data?.message || 'Failed to download file.',
          response.status,
          data?.errors,
          data
        );
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError(
          rawBody || 'Failed to download file.',
          response.status,
          undefined,
          rawBody
        );
      }
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition');
    const filename =
      disposition?.match(/filename="?([^"]+)"?/)?.[1] ||
      fallbackFilename ||
      'download';

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }
}

export const api = new ApiClient(API_BASE_URL);
export { ApiError };
export type { ApiResponse };
