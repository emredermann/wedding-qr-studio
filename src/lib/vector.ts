import type { VectorString } from "@/types/database";

export const FACE_EMBEDDING_DIMENSIONS = 128;

/**
 * Validates a face descriptor and serialises it as a pgvector literal.
 * The vector is L2-normalised so cosine similarity thresholds are stable
 * regardless of descriptor magnitude.
 *
 * @throws Error if the descriptor has the wrong length, contains non-finite
 *         values, or is the zero vector.
 */
export function toVectorString(descriptor: ArrayLike<number>): VectorString {
  if (descriptor.length !== FACE_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Face descriptor must have ${FACE_EMBEDDING_DIMENSIONS} dimensions, received ${descriptor.length}.`,
    );
  }

  let sumSquares = 0;
  for (let i = 0; i < descriptor.length; i += 1) {
    const v = descriptor[i];
    if (!Number.isFinite(v)) {
      throw new Error(`Face descriptor contains a non-finite value at index ${i}.`);
    }
    sumSquares += v * v;
  }

  const norm = Math.sqrt(sumSquares);
  if (norm === 0) {
    throw new Error("Face descriptor is the zero vector.");
  }

  const parts = new Array<string>(descriptor.length);
  for (let i = 0; i < descriptor.length; i += 1) {
    parts[i] = (descriptor[i] / norm).toFixed(7);
  }
  return `[${parts.join(",")}]`;
}

/** Parses a pgvector literal back into a Float32Array. */
export function parseVectorString(value: VectorString): Float32Array {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error("Invalid pgvector literal.");
  }
  const body = trimmed.slice(1, -1);
  const parts = body.length === 0 ? [] : body.split(",");
  const out = new Float32Array(parts.length);
  for (let i = 0; i < parts.length; i += 1) {
    const n = Number(parts[i]);
    if (!Number.isFinite(n)) throw new Error(`Invalid pgvector component at index ${i}.`);
    out[i] = n;
  }
  return out;
}
