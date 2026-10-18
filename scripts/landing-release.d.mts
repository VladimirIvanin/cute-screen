export interface LandingCatalog {
  tag: string
  releaseUrl: string
  checksumsUrl: string
  files: {
    platform: string
    extension: string
    name: string
    url: string
  }[]
}

export interface GitHubLandingRelease {
  tag_name: string
  draft?: boolean
  prerelease?: boolean
  assets: {
    name: string
    browser_download_url: string
    size: number
    state: string
  }[]
}

export function createLandingCatalog(release: GitHubLandingRelease): LandingCatalog | null
export function selectLandingCatalog(releases: GitHubLandingRelease[]): LandingCatalog
export function readLandingCatalog(file: string): Promise<LandingCatalog>
export function fetchLandingCatalog(options?: {
  token?: string
  request?: typeof fetch
}): Promise<LandingCatalog>
