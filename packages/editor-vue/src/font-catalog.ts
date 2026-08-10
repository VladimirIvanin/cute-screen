export interface SystemFontFace {
  readonly family: string
  readonly weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
  readonly style: 'normal' | 'italic'
}

/** Platform adapters discover family metadata; font binaries never use JSON IPC. */
export interface SystemFontCatalogBridge {
  listSystemFonts(correlationId: string): Promise<readonly SystemFontFace[]>
}
