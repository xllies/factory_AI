const DEFAULT_INTERNAL_PATH = "/today";
const MAX_PATH_LENGTH = 512;

function isAllowedInternalPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  if (/[\u0000-\u001F\u007F]/.test(path)) return false;
  return true;
}

export function getSafeInternalPath(raw: string | null | undefined): string {
  if (raw == null) return DEFAULT_INTERNAL_PATH;
  const trimmed = raw.trim();
  if (!isAllowedInternalPath(trimmed)) return DEFAULT_INTERNAL_PATH;
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return DEFAULT_INTERNAL_PATH;
  }
  if (!isAllowedInternalPath(decoded)) return DEFAULT_INTERNAL_PATH;
  return decoded;
}
