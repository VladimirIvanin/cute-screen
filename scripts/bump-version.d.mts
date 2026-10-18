export function bumpVersion(
  root: string,
  next: string | undefined,
): Promise<{ current: string; next: string }>
