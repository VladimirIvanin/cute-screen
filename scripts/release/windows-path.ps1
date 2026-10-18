function Get-ReleaseCanonicalPath {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)
  # Windows PowerShell 5.1 Resolve-Path preserves 8.3 names while .NET expands them.
  [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $LiteralPath).ProviderPath)
}
