/**
 * URL helpers shared by server and browser code.
 *
 * Images are shown through Google's image CDN (`lh3.googleusercontent.com`)
 * instead of `drive.google.com/uc?id=` links, which hit CORS/403 rate limits
 * when embedded in <img>. The CDN also converts iPhone HEIC photos to JPEG.
 */

export const GRID_IMAGE_SIZE = 600;
export const FULL_IMAGE_SIZE = 1600;

export function driveImageUrl(fileId: string, size: number = GRID_IMAGE_SIZE): string {
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}=s${size}`;
}

/** Range-capable proxy for video/audio playback and original-quality downloads. */
export function streamUrl(fileId: string, options: { download?: boolean } = {}): string {
  const base = `/api/drive/stream/${encodeURIComponent(fileId)}`;
  return options.download ? `${base}?download=1` : base;
}

/**
 * Thumbnail source for an item: approved items use the public image CDN,
 * pending/hidden items (visible only to the host or uploader) use our proxy.
 */
export function mediaImageSrc(item: { fileId: string; status: string }, size: number = GRID_IMAGE_SIZE): string {
  return item.status === "approved"
    ? driveImageUrl(item.fileId, size)
    : `/api/drive/thumb/${encodeURIComponent(item.fileId)}?s=${size}`;
}
