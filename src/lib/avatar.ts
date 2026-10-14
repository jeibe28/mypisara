export const AVATAR_MAX_BYTES = 1024 * 1024;
export const AVATAR_SIZE = 256;

// Identifies the image from its first bytes; the browser-supplied type is not trusted.
export function avatarType(bytes: Uint8Array) {
  const at = (offset: number, ...values: number[]) => values.every((v, i) => bytes[offset + i] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { mime: "image/png", extension: "png" };
  if (at(0, 0xff, 0xd8, 0xff)) return { mime: "image/jpeg", extension: "jpg" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50))
    return { mime: "image/webp", extension: "webp" };
  return null;
}

// The blob pathname behind a user's stored avatar URL, or null.
export function avatarPath(userId: string, image: string | null | undefined) {
  if (!image?.startsWith("/api/avatar?")) return null;
  const path = new URLSearchParams(image.split("?")[1]).get("path");
  return path?.startsWith(`avatars/${userId}/`) && !path.includes("..") ? path : null;
}
