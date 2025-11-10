. "$PSScriptRoot/start-bot.impl.ps1"

try {
    DwdmLauncher_ShowEnvironmentInfo -RepoRoot (Split-Path -Parent $PSScriptRoot) -Dev
    Write-Host 'SUCCESS'
} catch {
    Write-Host 'ERROR:'
    Write-Host $_.ToString()
    if ($_.ScriptStackTrace) {
        Write-Host 'STACK:'
        Write-Host $_.ScriptStackTrace
    }
    if ($_.InvocationInfo) {
        Write-Host 'INVOCATION:'
        Write-Host $_.InvocationInfo.PositionMessage
    }
}
