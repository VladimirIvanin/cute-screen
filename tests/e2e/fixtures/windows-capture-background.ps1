Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CaptureBackgroundWindow {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr window, int command);
}
'@

# A real, opaque desktop-sized window behind the editor. No capture pixels are
# mocked: the production DXGI backend must recover this exact colour on hide.
$captureBackground = New-Object System.Windows.Forms.Form
$captureBackground.FormBorderStyle = 'None'
$captureBackground.StartPosition = 'Manual'
$captureBackground.Bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$captureBackground.BackColor = [System.Drawing.Color]::FromArgb(37, 71, 105)
$captureBackground.ShowInTaskbar = $false
$captureBackground.TopMost = $true
$captureBackground.Add_Shown({
    # The helper's hidden console startup flag can suppress its first ShowWindow.
    # Reveal the fixture explicitly once the WinForms message loop is running.
    $captureBackground.BeginInvoke([Action]{
        [CaptureBackgroundWindow]::ShowWindow($captureBackground.Handle, 5) | Out-Null
        $captureBackground.TopMost = $true
        $captureBackground.BringToFront()
        $captureBackground.Refresh()
        [Console]::WriteLine('capture-background-ready')
    }) | Out-Null
})
[System.Windows.Forms.Application]::Run($captureBackground)
