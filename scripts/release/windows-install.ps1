param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$Directory,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
if (-not $Directory) { throw 'An isolated installation directory is required' }
$installPath = [System.IO.Path]::GetFullPath($Directory)
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if (-not $installPath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'The test installation must stay under the runner temporary directory'
}
if ($Uninstall) {
  $expectedUninstaller = (Resolve-Path -LiteralPath (Join-Path $installPath 'uninstall.exe')).Path
  if ($installerPath -ne $expectedUninstaller) {
    throw 'Only the temporary test installation may be uninstalled'
  }
  $installerProcess = Start-Process -FilePath $installerPath -ArgumentList "/S _?=$Directory" -WindowStyle Hidden -Wait -PassThru
} else {
  $uninstallRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
  if (Test-Path -LiteralPath $uninstallRegistry) {
    foreach ($installedKey in Get-ChildItem -LiteralPath $uninstallRegistry) {
      $installedApp = Get-ItemProperty -LiteralPath $installedKey.PSPath
      if ($installedApp.DisplayName -eq 'Cute Screen') {
        throw 'Cute Screen is already installed; run installer verification on a clean VM or runner'
      }
    }
  }
  $installerProcess = Start-Process -FilePath $installerPath -ArgumentList "/S /D=$installPath" -WindowStyle Hidden -Wait -PassThru
}
if ($installerProcess.ExitCode -ne 0) { throw "NSIS exited with $($installerProcess.ExitCode)" }
