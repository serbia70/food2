export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function createApiSuccess<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function createApiError(code: string, message: string, details?: unknown): ApiError {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}

export function isApiSuccess<T>(value: ApiSuccess<T> | ApiError): value is ApiSuccess<T> {
  return value.ok === true;
}

export function isApiError<T>(value: ApiSuccess<T> | ApiError): value is ApiError {
  return value.ok === false;
}
