param(
    [Parameter(Mandatory = $true)][string]$ControlPath,
    [Parameter(Mandatory = $true)][string]$ArtifactsPath,
    [Parameter(Mandatory = $true)][string]$AppExecutable
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowCaptureInput {
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
    [StructLayout(LayoutKind.Explicit)] struct UNION {
        [FieldOffset(0)] public KEYBOARD keyboard;
        [FieldOffset(0)] public MOUSE mouse;
    }
    [StructLayout(LayoutKind.Sequential)] struct KEYBOARD { public ushort key, scan; public uint flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSE { public int x, y; public uint data, flags, time; public IntPtr extra; }
    public static void Key(ushort key, bool up) {
        var value = new INPUT { type = 1, data = new UNION { keyboard = new KEYBOARD { key = key, flags = up ? 2u : 0u } } };
        if (SendInput(1, new[] { value }, Marshal.SizeOf(typeof(INPUT))) != 1) throw new InvalidOperationException("Native key injection failed");
    }
    public static void Press(ushort key) { Key(key, false); Key(key, true); }
    public static void Click() {
        var down = new INPUT { type = 0, data = new UNION { mouse = new MOUSE { flags = 2 } } };
        var up = new INPUT { type = 0, data = new UNION { mouse = new MOUSE { flags = 4 } } };
        if (SendInput(2, new[] { down, up }, Marshal.SizeOf(typeof(INPUT))) != 2) throw new InvalidOperationException("Native mouse injection failed");
    }
}
'@
[WindowCaptureInput]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
$AppExecutable = [IO.Path]::GetFullPath($AppExecutable)
$display = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$target = New-Object System.Windows.Forms.Form
$target.Text = 'Cute Screen Window Capture Fixture'
$target.StartPosition = 'Manual'
$target.SetBounds($display.X + 80, $display.Y + 80, [Math]::Min(1400, $display.Width - 160), [Math]::Min(1000, $display.Height - 180))
$target.BackColor = [System.Drawing.Color]::FromArgb(37, 71, 105)
$target.ShowInTaskbar = $false
$target.TopMost = $true
$occluder = New-Object System.Windows.Forms.Form
$occluder.Text = 'Occluding window - must not appear in capture'
$occluder.StartPosition = 'Manual'
$occluder.SetBounds($target.Left + 400, $target.Top + 220, 700, 480)
$occluder.BackColor = [System.Drawing.Color]::FromArgb(250, 22, 204)
$occluder.TopMost = $true
$occluder.ShowInTaskbar = $false
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 50
$script:armed = $null
$script:selectorSeen = $null
$timer.Add_Tick({
    if (Test-Path -LiteralPath $ControlPath) {
        $script:armed = [IO.File]::ReadAllText($ControlPath).Trim()
        Remove-Item -LiteralPath $ControlPath
        $target.BringToFront()
        $occluder.BringToFront()
        [WindowCaptureInput]::SetCursorPos($target.Left + 100, $target.Top + 150) | Out-Null
        $script:selectorSeen = $null
    }
    if (-not $script:armed) { return }
    $selector = [IntPtr]::Zero
    do {
        $selector = [WindowCaptureInput]::FindWindowEx([IntPtr]::Zero, $selector, 'CuteScreenWindowPicker', $null)
        if ($selector -eq [IntPtr]::Zero) { return }
        $ownerPid = [uint32]0
        [WindowCaptureInput]::GetWindowThreadProcessId($selector, [ref]$ownerPid) | Out-Null
        $owner = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    } while (-not [WindowCaptureInput]::IsWindowVisible($selector) -or $owner.Path -ne $AppExecutable)
    if (-not $script:selectorSeen) { $script:selectorSeen = [DateTime]::UtcNow; return }
    if (([DateTime]::UtcNow - $script:selectorSeen).TotalMilliseconds -lt 350) { return }
    $bitmap = New-Object System.Drawing.Bitmap($display.Width, $display.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($display.Location, [System.Drawing.Point]::Empty, $display.Size)
    $bitmap.Save((Join-Path $ArtifactsPath ('window-selector-' + $script:armed + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    if ($script:armed -eq 'cancel') {
        [WindowCaptureInput]::Press(0x1b)
    } elseif ($script:armed -eq 'keyboard') {
        [WindowCaptureInput]::Press(0x09)
        [WindowCaptureInput]::Key(0x10, $false)
        [WindowCaptureInput]::Press(0x09)
        [WindowCaptureInput]::Key(0x10, $true)
        [WindowCaptureInput]::Press(0x0d)
    } else {
        [WindowCaptureInput]::Click()
    }
    $script:armed = $null
})
$target.Add_Shown({
    $target.BeginInvoke([Action]{
        [WindowCaptureInput]::ShowWindow($target.Handle, 5) | Out-Null
        $occluder.Show()
        [WindowCaptureInput]::ShowWindow($occluder.Handle, 5) | Out-Null
        $occluder.BringToFront()
        $timer.Start()
        [Console]::WriteLine('window-capture-fixture-ready')
    }) | Out-Null
})
try { [System.Windows.Forms.Application]::Run($target) }
finally { $timer.Dispose(); $occluder.Dispose(); $target.Dispose() }
