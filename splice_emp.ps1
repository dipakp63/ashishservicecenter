$appJs = 'public\app.js'
$empBlock = 'emp_block.js'
$outFile = 'public\app.js'

$before = Get-Content $appJs -Encoding UTF8 | Select-Object -First 4196
$after = Get-Content $appJs -Encoding UTF8 | Select-Object -Skip 4463
$newBlock = Get-Content $empBlock -Encoding UTF8

$merged = $before + $newBlock + $after
Set-Content $outFile $merged -Encoding UTF8
Write-Host "Done. Total lines: $($merged.Count)"
