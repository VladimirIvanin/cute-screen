param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$Directory,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
if ($Uninstall) {
  $installerProcess = Start-Process -FilePath $installerPath -ArgumentList "/S _?=$Directory" -WindowStyle Hidden -Wait -PassThru
} else {
  if (-not $Directory) { throw 'An isolated installation directory is required' }
  $installPath = [System.IO.Path]::GetFullPath($Directory)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if (-not $installPath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The test installation must stay under the runner temporary directory'
  }
  $installerProcess = Start-Process -FilePath $installerPath -ArgumentList "/S /D=$installPath" -WindowStyle Hidden -Wait -PassThru
}
if ($installerProcess.ExitCode -ne 0) { throw "NSIS exited with $($installerProcess.ExitCode)" }
