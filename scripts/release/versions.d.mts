export function versionFiles(directory: string): Promise<string[]>
export function readVersions(directory?: string): Promise<Record<string, string | undefined>>
export function checkVersions(tag?: string, directory?: string): Promise<string>
export function setVersion(version: string, directory?: string): Promise<void>
export function preflight(): Promise<void>
