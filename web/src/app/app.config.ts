import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  EnvironmentProviders,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideCheckNoChangesConfig,
} from '@angular/core';

/**
 * Dev-only providers (#47).
 *
 * The app is zoneless (Angular 22): state that changes without a signal update (or an explicit
 * `markForCheck`) simply does not re-render - silently. `provideCheckNoChangesConfig` makes
 * Angular run an exhaustive `checkNoChanges` periodically and THROW instead of showing stale UI.
 *
 * Fill this with exactly one entry when `isDevMode()` is true:
 * `provideCheckNoChangesConfig({ exhaustive: true, interval: 1000 })` (`@developerPreview` in
 * Angular 20+), and keep it EMPTY in production builds - the check costs time and is a
 * development aid only.
 */
export const DEV_ONLY_PROVIDERS: EnvironmentProviders[] = isDevMode()
  ? [provideCheckNoChangesConfig({ exhaustive: true, interval: 1000 })]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient(), ...DEV_ONLY_PROVIDERS],
};
