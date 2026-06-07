$games = Get-ChildItem "HKCU:\System\GameConfigStore\Children" -ErrorAction SilentlyContinue |
  ForEach-Object {
    $entry = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($entry.MatchedExeFullPath) { $entry.MatchedExeFullPath }
    if ($entry.ExecutablePath) { $entry.ExecutablePath }
  } |
  Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
  Sort-Object -Unique

ConvertTo-Json -Compress -InputObject @($games)
