import type { Buffer } from 'node:buffer'

export interface ReleaseAsset {
  path: string
  bytes: number
  sha256: string
}

export interface ResourceInfo {
  version: string
  appVersion: string
  customProtocol: boolean
  fakePlatform: boolean
  testHarness: boolean
  platformSmoke: boolean
  assets: ReleaseAsset[]
}

export interface PackageManifest {
  version: string
  commit: string
  packages: { name: string; bytes: number; sha256: string }[]
}

export const targets: { id: string; target: string; extensions: string[] }[]
export const forbidden: string[]
export function stableVersion(version: string): string
export function validateVersions(entries: Record<string, string | undefined>, tag?: string): string
export function packageNames(version: string): string[]
export function sha256(bytes: Buffer): string
export function architectures(bytes: Buffer): string[]
export function assertArchitecture(bytes: Buffer, id: string): string[]
export function checkGlibc(output: string): string[]
export function validateResources(info: ResourceInfo, version: string, frontend: ReleaseAsset[]): void
export function validateManifest(manifest: PackageManifest, files: Map<string, Buffer>): void
export function assertDraftUpdate(
  release: { draft: boolean; tag_name?: string; body?: string } | null,
  tag: string,
  commit: string,
): void
