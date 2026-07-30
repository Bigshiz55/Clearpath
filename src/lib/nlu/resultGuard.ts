/**
 * SEARCH RESULT GUARD (pure). The last line of defence before a title result is
 * shown as "the answer". Given the requested title/provider and what the search
 * actually returned, it produces a strict status and decides whether the result
 * may be presented AS the requested title. This is what stops "Gone Girl" from
 * being rendered as the answer to "Gone on BritBox".
 *
 * Statuses (never visually interchangeable — the UI must distinguish them):
 *   EXACT_MATCH               normalized title equals request; provider satisfied/verified
 *   POSSIBLE_MATCH            title is a near/contains match, not exact
 *   NOT_VERIFIED              exact title, but provider availability unverified
 *   NOT_AVAILABLE_ON_SERVICE  exact title, but confirmed NOT on the required service
 *   NO_MATCH                  no exact title found
 *
 * `blockAsAnswer` is true whenever the result must NOT be presented as the
 * requested title (a substitution). No I/O; unit-tested.
 */
import { isExactTitle, titleMatchTier } from '@/lib/nlu/titleNormalize';

export type ResultStatus =
  | 'EXACT_MATCH'
  | 'POSSIBLE_MATCH'
  | 'NOT_VERIFIED'
  | 'NOT_AVAILABLE_ON_SERVICE'
  | 'NO_MATCH';

export interface GuardInput {
  requestedTitle: string | null;
  returnedTitle: string | null;
  /** The provider the user required, if any. */
  requiredProvider: string | null;
  providerStrength: 'hard' | 'soft' | null;
  /** Availability of the returned title on the required provider: */
  providerAvailability: 'verified' | 'unverified' | 'confirmed_absent';
  /** Requested media type, and the returned one (for a compatibility check). */
  requestedType?: 'movie' | 'tv' | 'unknown';
  returnedType?: 'movie' | 'tv';
}

export interface GuardResult {
  status: ResultStatus;
  blockAsAnswer: boolean;
  /** Which hard constraint failed, for an honest UI message. */
  failedConstraint: 'title' | 'provider' | 'availability' | 'media_type' | null;
  message: string;
}

export function validateTitleResult(i: GuardInput): GuardResult {
  const req = i.requestedTitle ?? '';
  const ret = i.returnedTitle ?? '';

  // 1) No returned title, or not even a near match → NO_MATCH.
  if (!ret || titleMatchTier(req, ret) === 'none') {
    return {
      status: 'NO_MATCH', blockAsAnswer: true, failedConstraint: 'title',
      message: `No match for “${req}” was found.`,
    };
  }

  const exact = isExactTitle(req, ret);

  // 2) Not an exact title → POSSIBLE_MATCH; must never be shown AS the request.
  if (!exact) {
    return {
      status: 'POSSIBLE_MATCH', blockAsAnswer: true, failedConstraint: 'title',
      message: `“${ret}” is a possible match — it does not exactly match “${req}”.`,
    };
  }

  // 3) Media-type incompatibility (only when the user committed to a type).
  if (i.requestedType && i.requestedType !== 'unknown' && i.returnedType && i.requestedType !== i.returnedType) {
    return {
      status: 'POSSIBLE_MATCH', blockAsAnswer: true, failedConstraint: 'media_type',
      message: `Found “${ret}”, but not as a ${i.requestedType}.`,
    };
  }

  // Exact title from here down. Now judge the provider requirement.
  if (i.requiredProvider && i.providerStrength === 'hard') {
    if (i.providerAvailability === 'confirmed_absent') {
      return {
        status: 'NOT_AVAILABLE_ON_SERVICE', blockAsAnswer: true, failedConstraint: 'provider',
        message: `We found “${ret}”, but it is not currently available on ${i.requiredProvider} in your region.`,
      };
    }
    if (i.providerAvailability === 'unverified') {
      return {
        status: 'NOT_VERIFIED', blockAsAnswer: false, failedConstraint: 'availability',
        message: `We found “${ret}”, but could not verify that it is currently available on ${i.requiredProvider} in your region.`,
      };
    }
  }

  // Exact title, provider satisfied (or none/soft) → the real answer.
  return {
    status: 'EXACT_MATCH', blockAsAnswer: false, failedConstraint: null,
    message: i.requiredProvider ? `Exact title match — available on ${i.requiredProvider}.` : `Exact title match: ${ret}.`,
  };
}
