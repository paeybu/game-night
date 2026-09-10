/**
 * Upload budgets. The `maxBytes` values must stay at or below the
 * `file_size_limit` set on the matching bucket in supabase/schema.sql —
 * they are the client-side guard that keeps a rejected upload from
 * surfacing as a cryptic storage error.
 */
export const GUEST_PHOTO = {
  /** Target after compression. A 4032×3024 phone photo lands around 400–700 KB. */
  maxSizeMB: 0.8,
  /** Enough for a projector; the host display caps images at 70vh anyway. */
  maxWidthOrHeight: 1600,
  /** Bucket `photos` limit. */
  maxBytes: 2 * 1024 * 1024,
} as const;

export const CANDIDATE_PHOTO = {
  /** Rendered as a square thumbnail in a grid, so it needs far less. */
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1200,
  /** Bucket `candidates` limit. */
  maxBytes: 5 * 1024 * 1024,
} as const;

/** Refuse absurd input before handing it to the compressor. */
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
