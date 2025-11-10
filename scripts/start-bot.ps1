[CmdletBinding()]
param(
    [switch]$Dev,
    [switch]$SkipInstall,
    [switch]$NoPause,
    [switch]$VerboseStartup
)

. "$PSScriptRoot/start-bot.impl.ps1"

$repoRoot = Split-Path -Parent $PSScriptRoot
$exitCode = Invoke-DwdmLauncher -RepoRoot $repoRoot @PSBoundParameters
exit $exitCode
