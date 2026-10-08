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
  /** Free-text note for this image (`""` if none). Never part of the render request. */
  comment: string;
  /** Pure render time on the bridge in seconds; `null` for images rendered before #19. */
  render_seconds: number | null;
}

/** One entry of `GET /api/projects` (newest first). */
export interface ProjectInfo {
  id: string;
  image_count: number;
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

/**
 * Samplers accepted by the GX10 bridge (queried 08.10.2026 via an intentionally invalid request,
 * HTTP 400 lists the allowed values; see issue #11). Order as returned by the bridge.
 */
export const SAMPLERS = [
  'euler',
  'euler_cfg_pp',
  'euler_ancestral',
  'euler_ancestral_cfg_pp',
  'heun',
  'heunpp2',
  'exp_heun_2_x0',
  'exp_heun_2_x0_sde',
  'dpm_2',
  'dpm_2_ancestral',
  'lms',
  'dpm_fast',
  'dpm_adaptive',
  'dpmpp_2s_ancestral',
  'dpmpp_2s_ancestral_cfg_pp',
  'dpmpp_sde',
  'dpmpp_sde_gpu',
  'dpmpp_2m',
  'dpmpp_2m_cfg_pp',
  'dpmpp_2m_sde',
  'dpmpp_2m_sde_gpu',
  'dpmpp_2m_sde_heun',
  'dpmpp_2m_sde_heun_gpu',
  'dpmpp_3m_sde',
  'dpmpp_3m_sde_gpu',
  'ddpm',
  'lcm',
  'ipndm',
  'ipndm_v',
  'deis',
  'cfgpp_ud10_ab',
  'res_multistep',
  'res_multistep_cfg_pp',
  'res_multistep_ancestral',
  'res_multistep_ancestral_cfg_pp',
  'gradient_estimation',
  'gradient_estimation_cfg_pp',
  'er_sde',
  'seeds_2',
  'seeds_3',
  'sa_solver',
  'sa_solver_pece',
  'ddim',
  'uni_pc',
  'uni_pc_bh2',
] as const;

/** Schedulers accepted by the GX10 bridge (same source as `SAMPLERS`). */
export const SCHEDULERS = [
  'simple',
  'sgm_uniform',
  'karras',
  'exponential',
  'ddim_uniform',
  'beta',
  'normal',
  'linear_quadratic',
  'kl_optimal',
] as const;

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
