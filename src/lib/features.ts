/**
 * Product-wide switches.
 *
 * "Beni Bul" (face search) processes biometric data, which KVKK treats as a
 * special category needing explicit consent. It is hidden and switched off
 * everywhere until NEXT_PUBLIC_FACE_SEARCH=on: no face analysis in the
 * browser, no face descriptors stored, the search endpoint refuses, and the
 * guest / host / marketing screens do not mention it.
 */
export const FACE_SEARCH_AVAILABLE = process.env.NEXT_PUBLIC_FACE_SEARCH === "on";
