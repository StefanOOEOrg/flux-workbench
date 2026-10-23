import { Injectable, signal } from '@angular/core';

/**
 * The app-wide error message plus the single HTTP error funnel (#47).
 *
 * `WorkbenchStore` exposes both as aliases (`readonly error = this.errors.error;`), so every
 * `this.error.set(...)` in the store keeps working and no component changes.
 */
@Injectable({ providedIn: 'root' })
export class ErrorState {
  /** Current message shown in the UI; `null` = no error. */
  readonly error = signal<string | null>(null);

  /**
   * Run one API action with the class-wide error handling:
   *
   * - `try { return { ok: true, value: await action() }; }`
   * - `catch (err) { this.error.set(errorMessage(err)); return { ok: false }; }`
   *
   * Contract:
   * - NEVER rethrows; an API error must not escape a component callback.
   * - Does NOT touch `error` on success. Callers that want a success to clear an old message
   *   call `this.error.set(null)` themselves - `refreshJobs()` must keep the message.
   * - `T` may be `void`; the `ok` flag, not the value, tells success from failure.
   *
   * Implementation needs `errorMessage` from `./error-message`.
   */
  async attempt<T>(action: () => Promise<T>): Promise<AttemptResult<T>> {
    void action;
    throw new Error('not implemented yet');
  }
}

/** Result of {@link ErrorState}'s `attempt()`: the value, or "failed, `error` is set". */
export type AttemptResult<T> = { ok: true; value: T } | { ok: false };
