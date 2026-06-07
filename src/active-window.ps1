Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ForegroundWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true)] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@

$handle = [ForegroundWindow]::GetForegroundWindow()
$builder = New-Object System.Text.StringBuilder 1024
[void][ForegroundWindow]::GetWindowText($handle, $builder, $builder.Capacity)
$processId = 0
[void][ForegroundWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue

[PSCustomObject]@{
  title = $builder.ToString()
  processName = if ($process) { $process.ProcessName } else { "" }
  executablePath = if ($process) {
    try { $process.MainModule.FileName } catch { "" }
  } else { "" }
  pid = $processId
} | ConvertTo-Json -Compress
