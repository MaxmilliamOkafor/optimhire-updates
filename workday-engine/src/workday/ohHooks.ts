/**
 * Hooks a host extension sets to run the engine unattended (OptimHire runs:
 * nobody at the PC, so it submits instead of stopping on Review and asks the
 * host for answers). With no hooks set the engine behaves exactly as in the
 * standalone extension.
 */
import type { ControlKind } from "./controls.js";
import type { Profile, RunState, StoredDoc, WorkdaySettings } from "./types.js";

export type Outcome = "submitted" | "review" | "paused" | "error" | "stopped";

export interface OpenQuestion {
  label: string;
  kind: ControlKind;
  options: string[];
  required: boolean;
}

export interface EngineHooks {
  /** This run's profile / settings / master CV instead of the stored ones. */
  profile?: () => Promise<Profile>;
  settings?: () => Promise<WorkdaySettings>;
  masterCv?: () => Promise<StoredDoc | undefined>;
  /** Click Submit on Review instead of stopping there. */
  autoSubmit?: () => boolean;
  /** Fetch answers for a page's open questions in one request, before they are resolved one by one. */
  prefetch?: (questions: OpenQuestion[]) => Promise<void>;
  /** The host's answer to one question (the user's own saved answers / answer service), or null. */
  answer?: (label: string, kind: ControlKind, options: string[]) => Promise<string | null>;
  /** The run ended: submitted, stopped on Review, paused for the user, failed, or stopped. */
  onFinish?: (run: RunState, outcome: Outcome) => void;
  /** Every page the run reaches. */
  onPage?: (run: RunState) => void;
}

export const hooks: EngineHooks = {};

export function setHooks(h: EngineHooks): void {
  clearHooks();
  Object.assign(hooks, h);
}

export function clearHooks(): void {
  for (const k of Object.keys(hooks)) delete (hooks as Record<string, unknown>)[k];
}
