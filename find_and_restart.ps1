$procs = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'"
foreach ($p in $procs) {
    if ($p.CommandLine -like "*serve.ps1*") {
        Write-Host "Found serve.ps1 process: $($p.ProcessId) - $($p.CommandLine)"
        Stop-Process -Id $p.ProcessId -Force
        Write-Host "Killed $($p.ProcessId)"
    }
}
