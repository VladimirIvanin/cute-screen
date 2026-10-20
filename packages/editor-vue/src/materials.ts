export interface MaterialRecord {
  readonly id: string
  readonly title: string
  readonly kind: 'background' | 'logo' | 'gradient' | 'preset'
  readonly valueJson: string
  readonly byteSize: number
}
export interface MaterialBridge {
  list(): Promise<readonly MaterialRecord[]>
  put(record: Omit<MaterialRecord, 'byteSize'>): Promise<void>
  remove(id: string): Promise<void>
}
