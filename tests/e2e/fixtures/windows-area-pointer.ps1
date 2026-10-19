param(
    [Parameter(Mandatory=$true)][string]$AppExecutable,
    [Parameter(Mandatory=$true)][ValidateSet('inside','top','left','right','bottom','top-left','top-right','bottom-left','bottom-right','full','cancel-drag')][string]$Case
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AreaPointer {
    public delegate bool EnumProc(IntPtr window, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, IntPtr cls, IntPtr title);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
    [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
}
'@
[AreaPointer]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$ownedProcessIds = @((Get-Process -Name 'cute-screen' -ErrorAction Stop | Where-Object Path -EQ $AppExecutable).Id)
if ($ownedProcessIds.Count -ne 1) { throw 'Expected one owned test application process' }
$areaWindow = [IntPtr]::Zero
do {
    $areaWindow = [AreaPointer]::FindWindowEx([IntPtr]::Zero, $areaWindow, [IntPtr]::Zero, [IntPtr]::Zero)
    if ($areaWindow -eq [IntPtr]::Zero) { throw 'Owned visible Quick Capture window not found' }
    $ownerPid = [uint32]0
    [AreaPointer]::GetWindowThreadProcessId($areaWindow, [ref]$ownerPid) | Out-Null
} while (-not [AreaPointer]::IsWindowVisible($areaWindow) -or $ownerPid -notin $ownedProcessIds)
$areaRect = New-Object AreaPointer+Rect
if (-not [AreaPointer]::GetClientRect($areaWindow, [ref]$areaRect)) { throw 'GetClientRect failed' }
$origin = New-Object AreaPointer+Point
if (-not [AreaPointer]::ClientToScreen($areaWindow, [ref]$origin)) { throw 'ClientToScreen failed' }
$areaWidth = $areaRect.Right
$areaHeight = $areaRect.Bottom
$startX = [int]($areaWidth / 4)
$startY = [int]($areaHeight / 3)
switch ($Case) {
    'top' { $startY = 0 }
    'left' { $startX = 0 }
    'right' { $startX = $areaWidth - 1 }
    'bottom' { $startY = $areaHeight - 1 }
    'top-left' { $startX = 0; $startY = 0 }
    'top-right' { $startX = $areaWidth - 1; $startY = 0 }
    'bottom-left' { $startX = 0; $startY = $areaHeight - 1 }
    'bottom-right' { $startX = $areaWidth - 1; $startY = $areaHeight - 1 }
    'full' { $startX = 0; $startY = 0 }
}
$endX = if ($startX -gt $areaWidth / 2) { $startX - 140 } else { $startX + 140 }
$endY = if ($startY -gt $areaHeight / 2) { $startY - 140 } else { $startY + 140 }
if ($Case -eq 'full') { $endX = $areaWidth - 1; $endY = $areaHeight - 1 }
try {
    if (-not [AreaPointer]::SetCursorPos($origin.X + $startX, $origin.Y + $startY)) { throw 'SetCursorPos failed' }
    Start-Sleep -Milliseconds 60
    [AreaPointer]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [AreaPointer]::SetCursorPos($origin.X + $endX, $origin.Y + $endY) | Out-Null
    Start-Sleep -Milliseconds 100
    if ($Case -eq 'cancel-drag') {
        [AreaPointer]::keybd_event(0x1b, 0, 0, [UIntPtr]::Zero)
        [AreaPointer]::keybd_event(0x1b, 0, 2, [UIntPtr]::Zero)
    }
} finally {
    [AreaPointer]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}
@{ case=$Case; width=$areaWidth; height=$areaHeight; start=@($startX,$startY); end=@($endX,$endY); hwnd=$areaWindow.ToInt64() } | ConvertTo-Json -Compress
