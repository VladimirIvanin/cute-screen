$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CaptureBackgroundWindow {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
'@

# A real, opaque desktop-sized window behind the editor. No capture pixels are
# mocked: the production DXGI backend must recover this exact colour on hide.
$captureBackground = New-Object System.Windows.Forms.Form
$captureBackground.Text = 'Cute Screen capture test background'
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
        $captureBackground.TopMost = $false
        $captureBackground.TopMost = $true
        $captureBackground.BringToFront()
        # Explicit native z-order: managed TopMost can still be true after the
        # inherited hidden startup state suppressed its initial placement.
        $desktopBounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
        if (-not [CaptureBackgroundWindow]::SetWindowPos($captureBackground.Handle, [IntPtr](-1),
            $desktopBounds.X, $desktopBounds.Y, $desktopBounds.Width, $desktopBounds.Height, 0x0050)) {
            throw 'Capture background placement failed'
        }
        $captureBackground.Refresh()
        [Console]::WriteLine('capture-background-ready handle=' + $captureBackground.Handle.ToInt64() + ' topmost=' + $captureBackground.TopMost)
    }) | Out-Null
})
[System.Windows.Forms.Application]::Run($captureBackground)
