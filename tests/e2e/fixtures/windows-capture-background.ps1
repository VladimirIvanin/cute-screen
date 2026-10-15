Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# A real, opaque desktop-sized window behind the editor. No capture pixels are
# mocked: the production DXGI backend must recover this exact colour on hide.
$captureBackground = New-Object System.Windows.Forms.Form
$captureBackground.FormBorderStyle = 'None'
$captureBackground.StartPosition = 'Manual'
$captureBackground.Bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$captureBackground.BackColor = [System.Drawing.Color]::FromArgb(37, 71, 105)
$captureBackground.ShowInTaskbar = $false
$captureBackground.Add_Shown({ [Console]::WriteLine('capture-background-ready') })
[System.Windows.Forms.Application]::Run($captureBackground)
