export interface StagedImageMetadata {
  readonly token: string
  readonly assetUrl: string
  readonly mimeType: string
  readonly width: number
  readonly height: number
  readonly sha256: string
  readonly correlationId: string
}

export interface ImageTransportBridge {
  stageImage(token: string, correlationId: string): Promise<StagedImageMetadata>
  readImageBytes(token: string, correlationId: string): Promise<ArrayBuffer>
}

export type ImageTransportErrorCode =
  'dimensionMismatch' | 'imageCorrupt' | 'transportDenied'

export class ImageTransportError extends Error {
  readonly code: ImageTransportErrorCode
  readonly correlationId: string
  override readonly cause: unknown

  constructor(
    code: ImageTransportErrorCode,
    correlationId: string,
    message: string,
    cause?: unknown,
  ) {
    super(message)
    this.name = 'ImageTransportError'
    this.code = code
    this.correlationId = correlationId
    this.cause = cause
  }
}

export interface ObjectUrlLifecycle {
  create(blob: Blob): string
  revoke(url: string): void
}

export interface LoadImageOptions<Resource> {
  readonly token: string
  readonly correlationId: string
  readonly bridge: ImageTransportBridge
  readonly createResource: (
    image: HTMLImageElement,
    metadata: StagedImageMetadata,
  ) => Promise<Resource>
  readonly decodeImage?: (url: string) => Promise<HTMLImageElement>
  readonly objectUrls?: ObjectUrlLifecycle
  /** Test/evidence hook; production callers should not surface filesystem URLs. */
  readonly onPrimaryFailure?: (error: unknown, assetUrl: string) => void
}

export interface LoadedImageResource<Resource> {
  readonly resource: Resource
  readonly metadata: StagedImageMetadata
  readonly transport: 'asset' | 'binary'
}

async function decodeBrowserImage(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  // The scoped asset protocol is a distinct origin on Linux/macOS. Tauri adds
  // the matching CORS response header, while WebKitGTK requires the request to
  // opt into CORS before assigning `src` for `decode()` and pixel access.
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  return image
}

const browserObjectUrls: ObjectUrlLifecycle = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
}

function assertDimensions(
  image: HTMLImageElement,
  metadata: StagedImageMetadata,
): void {
  if (
    image.naturalWidth !== metadata.width ||
    image.naturalHeight !== metadata.height
  ) {
    throw new ImageTransportError(
      'dimensionMismatch',
      metadata.correlationId,
      `Decoded ${image.naturalWidth}x${image.naturalHeight}, expected ${metadata.width}x${metadata.height}`,
    )
  }
}

/**
 * Loads an opaque native image token without ever serializing image bytes as JSON.
 * The asset protocol is preferred; raw binary IPC is a bounded recovery path.
 */
export async function loadImageWithBinaryFallback<Resource>(
  options: LoadImageOptions<Resource>,
): Promise<LoadedImageResource<Resource>> {
  let metadata: StagedImageMetadata
  try {
    metadata = await options.bridge.stageImage(
      options.token,
      options.correlationId,
    )
  } catch (error) {
    throw new ImageTransportError(
      'transportDenied',
      options.correlationId,
      'Native image staging failed',
      error,
    )
  }

  const decodeImage = options.decodeImage ?? decodeBrowserImage
  const assetUrl = metadata.assetUrl
  try {
    const image = await decodeImage(assetUrl)
    assertDimensions(image, metadata)
    return {
      resource: await options.createResource(image, metadata),
      metadata,
      transport: 'asset',
    }
  } catch (error) {
    options.onPrimaryFailure?.(error, assetUrl)
    // Asset denial, decode failure and texture-source failure all retry from the
    // same opaque token over Tauri's binary IPC response.
  }

  let bytes: ArrayBuffer
  try {
    bytes = await options.bridge.readImageBytes(
      options.token,
      options.correlationId,
    )
  } catch (error) {
    throw new ImageTransportError(
      'transportDenied',
      options.correlationId,
      'Native binary image read failed',
      error,
    )
  }

  const objectUrls = options.objectUrls ?? browserObjectUrls
  const url = objectUrls.create(new Blob([bytes], { type: metadata.mimeType }))
  try {
    const image = await decodeImage(url)
    assertDimensions(image, metadata)
    return {
      resource: await options.createResource(image, metadata),
      metadata,
      transport: 'binary',
    }
  } catch (error) {
    if (error instanceof ImageTransportError) {
      throw error
    }
    throw new ImageTransportError(
      'imageCorrupt',
      options.correlationId,
      'Image decode or texture creation failed for both transport paths',
      error,
    )
  } finally {
    objectUrls.revoke(url)
  }
}
