export const releasePlatforms: Record<string, string[]>
export function validateReleaseVersion(
  root: string,
  tag: string,
): Promise<string>
export function hashFile(file: string): Promise<string>
export function prepareReleaseAssets(
  root: string,
  tag: string,
  platform: string,
  sha: string,
): Promise<void>
export function verifyReleaseAssets(
  directory: string,
  tag: string,
  sha: string,
): Promise<string[]>
