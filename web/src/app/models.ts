/** Types shared by the whole app. Fully defined (no stubs). */

export interface HiresOptions {
  scale?: number;
  denoise?: number;
  steps?: number;
}

export interface FaceFixOptions {
  steps?: number;
  denoise?: number;
}

/**
 * Payload for the GX10 bridge. Every key except `prompt` is optional:
 * a missing key means "use the bridge/preset default". `seed: null` = bridge rolls a seed.
 */
export interface RenderRequest {
  prompt: string;
  model?: string;
  preset?: string;
  width?: number;
  height?: number;
  seed?: number | null;
  steps?: number;
  guidance?: number;
  sampler?: string;
  scheduler?: string;
  hires?: boolean | HiresOptions;
  face_fix?: boolean | FaceFixOptions;
  hand_fix?: boolean;
  negative?: string;
  lora_strength?: number;
  lora2?: number | boolean;
}

/** Content of `<n>.json` as returned by `GET .../images/{n}/settings`. */
export interface ImageSettings {
  request: Record<string, unknown>;
  effective: Record<string, unknown> | null;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

/** Render job as returned by `GET /api/queue`. */
export interface Job {
  id: string;
  project_id: string;
  request: Record<string, unknown>;
  status: JobStatus;
  created_at: string;
  image_n: number | null;
  error: string | null;
}

export type DiffKind = 'added' | 'removed' | 'changed';

/** One difference between two settings objects; `path` uses dots, e.g. `hires.denoise`. */
export interface DiffEntry {
  path: string;
  kind: DiffKind;
  /** Value in the previous image (absent for `added`). */
  before?: unknown;
  /** Value in the selected image (absent for `removed`). */
  after?: unknown;
}

export const MODELS = ['qwen', 'flux', 'flux-lora'] as const;
export const PRESETS = ['realistic', 'final', 'fast', 'anime'] as const;

/** Form defaults for an empty project (values from Stefan's render.py example, seed empty). */
export const DEFAULT_REQUEST: RenderRequest = {
  prompt: 'A green car on the road in London',
  model: 'flux-lora',
  preset: 'realistic',
  width: 1024,
  height: 1024,
  seed: null,
  steps: 32,
  guidance: 1.8,
  sampler: 'dpmpp_2m',
  scheduler: 'beta',
  hires: { scale: 1.5, denoise: 0.4, steps: 25 },
  face_fix: { steps: 25, denoise: 0.4 },
  hand_fix: true,
  negative: '',
  lora_strength: 0.2,
  lora2: 1.35,
};
