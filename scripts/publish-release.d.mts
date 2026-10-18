export function releaseDownloadNotes(
  repository: string,
  tag: string,
): string
export function publishRelease(options: {
  directory: string
  repository: string
  tag: string
  sha: string
  token: string
  request?: typeof fetch
}): Promise<string>
