import { createHash } from 'node:crypto';
import type { ClientScope } from './clients.ts';
import { revisionOf, scopeInput } from './clients.ts';
import { DomainError, inputObject, invalid } from './notes.ts';

/** Effects echoed back in an acceptance may carry `details`; only code and targets are compared, details are covered by the digest. */
export interface ScopeEffect { code: string; targets: string[]; details?: Record<string, string | number | null> }
export interface ScopePreview { operation: 'client.change_scope'; targetId: string; previewDigest: string; effects: ScopeEffect[] }
export interface ScopeAcceptance { previewDigest: string; effects: { code: string; targets: string[] }[] }

/**
 * Extension point for entities whose scope relationships depend on the client (contacts, projects, ...).
 * Each provider re-queries its own tables, inside the write transaction, and reports only what exists.
 */
export type ScopeImpactProvider = (clientId: string, toScope: ClientScope) => ScopeEffect[];

/** Carries a preview for CONFIRMATION_REQUIRED (nothing accepted yet) or PREVIEW_CHANGED (acceptance no longer matches). */
export class ScopeConfirmationError extends DomainError {
  constructor(code: 'CONFIRMATION_REQUIRED' | 'PREVIEW_CHANGED', message: string, public readonly preview: ScopePreview) {
    super(code, message);
  }
}

const DIGEST = /^sha256-[0-9a-f]{64}$/;
const MAX_EFFECTS = 50;
const MAX_TARGETS = 1000;

function acceptanceInput(value: unknown): ScopeAcceptance {
  const input = inputObject(value, ['previewDigest', 'effects']);
  if (typeof input.previewDigest !== 'string' || !DIGEST.test(input.previewDigest)) invalid('La aceptación no incluye un digest válido.');
  if (!Array.isArray(input.effects) || input.effects.length > MAX_EFFECTS) invalid('La aceptación debe listar los efectos aceptados.');
  const effects = input.effects.map((entry: unknown) => {
    const effect = inputObject(entry, ['code', 'targets', 'details']);
    if (typeof effect.code !== 'string' || !effect.code || !Array.isArray(effect.targets) || effect.targets.length > MAX_TARGETS
      || effect.targets.some((target: unknown) => typeof target !== 'string')) invalid('Un efecto aceptado no es válido.');
    return { code: effect.code, targets: effect.targets as string[] };
  });
  return { previewDigest: input.previewDigest, effects };
}

export function changeScopeInput(value: unknown) {
  const input = inputObject(value, ['expectedRevision', 'scope', 'acceptance']);
  return {
    revision: revisionOf(input.expectedRevision), scope: scopeInput(input.scope),
    acceptance: input.acceptance === undefined ? undefined : acceptanceInput(input.acceptance),
  };
}

const sorted = <T>(values: T[], key: (value: T) => string) => [...values].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
const canonicalEffects = (effects: ScopeEffect[]) => sorted(effects, effect => effect.code).map(effect => ({
  code: effect.code, targets: sorted(effect.targets, target => target),
  details: Object.fromEntries(sorted(Object.entries(effect.details ?? {}), ([name]) => name)),
}));

/** Pure: callers pass the freshly read client and the impact providers' current answers. */
export function scopePreview(client: { id: string; revision: number; scope: ClientScope }, toScope: ClientScope,
  providers: ScopeImpactProvider[]): ScopePreview {
  const effects = canonicalEffects([
    { code: 'CHANGE_CLIENT_SCOPE', targets: [client.id], details: { fromScope: client.scope, toScope } },
    ...providers.flatMap(provider => provider(client.id, toScope)),
  ]);
  const digest = createHash('sha256').update(JSON.stringify({
    operation: 'client.change_scope', targetId: client.id, revision: client.revision,
    fromScope: client.scope, toScope, effects,
  })).digest('hex');
  return { operation: 'client.change_scope', targetId: client.id, previewDigest: `sha256-${digest}`, effects };
}

/** The digest is not trusted alone: the accepted codes and targets must also equal the recomputed effects. */
export function acceptanceMatches(preview: ScopePreview, acceptance: ScopeAcceptance): boolean {
  const shape = (effects: { code: string; targets: string[] }[]) => JSON.stringify(
    sorted(effects, effect => effect.code).map(effect => [effect.code, sorted(effect.targets, target => target)]));
  return acceptance.previewDigest === preview.previewDigest && shape(acceptance.effects) === shape(preview.effects);
}
