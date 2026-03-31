import { isApiError, isApiSuccess, type ApiError, type ApiSuccess } from '../../domain/api/api-envelope.ts';

type ApiEnvelope<T> = ApiSuccess<T> | ApiError;

export async function parseJsonEnvelope<T>(response: Response): Promise<T> {
  const payload = await response.json() as ApiEnvelope<T>;

  if (isApiSuccess(payload)) {
    return payload.data;
  }

  if (isApiError(payload)) {
    const code = payload.error.code || 'unknown_error';
    const message = payload.error.message || 'Unknown error';
    throw new Error(`${code}: ${message}`);
  }

  throw new Error('invalid_api_envelope: response is not canonical envelope');
}
