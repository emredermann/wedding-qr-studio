import type { MediaKind } from "@/types/domain";

/** Payload signed into `uploadToken` by /api/drive/upload-session and verified by /api/media/confirm. */
export interface UploadTokenPayload {
  u: string; // upload id (also stored in the Drive file's appProperties)
  e: string; // event id
  f: string; // destination Drive folder id
  s: number; // declared size in bytes
  m: string; // declared mime type
  k: MediaKind;
  g: string; // guest session id
  b: boolean; // guestbook recording
  n: string; // original file name
  x: number; // expiry (unix ms)
}
