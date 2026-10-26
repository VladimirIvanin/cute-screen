param([Parameter(Mandatory = $true)][string]$OutputPath)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$clipboardImage = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $clipboardImage) { throw 'The system clipboard has no bitmap after closing Quick Capture' }
try {
    $clipboardImage.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $clipboardImage.Dispose()
}
