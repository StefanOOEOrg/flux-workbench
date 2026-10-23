/**
 * Human-readable message for any error (#47) - moved out of `workbench.store.ts` so that both
 * `ErrorState` and the specs can use it without importing the store.
 *
 * Rules (unchanged):
 * - `HttpErrorResponse` with `error.detail` string (FastAPI) -> that string.
 * - `HttpErrorResponse` with `status === 0` -> `'Server not reachable'`.
 * - other `HttpErrorResponse` -> `` `HTTP ${status}: ${statusText}` ``.
 * - `Error` -> `message`; anything else -> `String(err)`.
 *
 * Move the existing implementation here verbatim; `workbench.store.ts` must re-export it
 * (`export { errorMessage } from './error-message';`) because the specs import it from there.
 */
export function errorMessage(err: unknown): string {
  void err;
  throw new Error('not implemented yet');
}
