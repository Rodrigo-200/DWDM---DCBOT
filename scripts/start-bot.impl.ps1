function DwdmLauncher_WriteBanner {
    param([string]$Title)
    $text = if ([string]::IsNullOrWhiteSpace($Title)) { 'DWDM Bot' } else { $Title.Trim() }
    $border = '+-' + ('-' * $text.Length) + '-+'
    Write-Host ''
    Write-Host $border -ForegroundColor Cyan
    Write-Host ('| ' + $text + ' |') -ForegroundColor Cyan
    Write-Host $border -ForegroundColor Cyan
}

function DwdmLauncher_WriteSection {
    param(
        [string]$Title,
        [string[]]$Lines,
        [ConsoleColor]$Color = [ConsoleColor]::DarkCyan
    )
    Write-Host ''
    Write-Host ('[' + $Title + ']') -ForegroundColor $Color
    if (-not $Lines -or $Lines.Count -eq 0) {
        Write-Host '  (no data)'
        return
    }
    foreach ($line in $Lines) {
        Write-Host ('  ' + $line)
    }
}

function DwdmLauncher_GetRelativeTime {
    param([string]$Timestamp)
    if ([string]::IsNullOrWhiteSpace($Timestamp)) {
        return 'never'
    }
    try {
        $moment = [DateTimeOffset]::Parse($Timestamp)
    } catch {
        return 'invalid timestamp'
    }
    $elapsed = [DateTimeOffset]::UtcNow - $moment.ToUniversalTime()
    if ($elapsed.TotalSeconds -le 1) { return 'just now' }
    $chunks = @()
    if ($elapsed.Days -gt 0) { $chunks += "$($elapsed.Days)d" }
    if ($elapsed.Hours -gt 0) { $chunks += "$($elapsed.Hours)h" }
    if ($elapsed.Minutes -gt 0) { $chunks += "$($elapsed.Minutes)m" }
    if ($chunks.Count -eq 0) { $chunks += "$([Math]::Round($elapsed.TotalSeconds))s" }
    return ($chunks -join ' ') + ' ago'
}

function DwdmLauncher_GetLocalTimestamp {
    param([string]$Timestamp)
    if ([string]::IsNullOrWhiteSpace($Timestamp)) { return '-' }
    try {
        return [DateTimeOffset]::Parse($Timestamp).ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss')
    } catch {
        return 'invalid timestamp'
    }
}

function DwdmLauncher_GetScheduleSnapshot {
    param([string]$RepoRoot)
    $statePath = Join-Path $RepoRoot 'data/state.json'
    if (-not (Test-Path $statePath)) {
        return @{ Exists = $false }
    }
    try {
        $state = Get-Content -Path $statePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        $entries = if ($state.scheduleEntries) { @($state.scheduleEntries) | Where-Object { $_ } } else { @() }
        return @{
            Exists = $true
            Entries = $entries
            LastAttempt = $state.scheduleLastAttemptAt
            LastSuccess = $state.scheduleLastSuccessAt
        }
    } catch {
        return @{ Exists = $false; Error = $_.Exception.Message }
    }
}

function DwdmLauncher_ShowScheduleStatus {
    param([string]$RepoRoot)
    $snapshot = DwdmLauncher_GetScheduleSnapshot -RepoRoot $RepoRoot
    $lines = @()
    if (-not $snapshot.Exists) {
        $lines += if ($snapshot.Error) {
            'Unable to read data/state.json (' + $snapshot.Error + ')'
        } else {
            'No schedule state found yet.'
        }
    } else {
        $count = if ($snapshot.Entries) { $snapshot.Entries.Count } else { 0 }
        $lines += ('Entries: {0}' -f $count)
        $lines += ('Last attempt: {0} ({1})' -f (DwdmLauncher_GetLocalTimestamp $snapshot.LastAttempt), (DwdmLauncher_GetRelativeTime $snapshot.LastAttempt))
        $lines += ('Last success: {0} ({1})' -f (DwdmLauncher_GetLocalTimestamp $snapshot.LastSuccess), (DwdmLauncher_GetRelativeTime $snapshot.LastSuccess))
        if ($count -gt 0) {
            $preview = $snapshot.Entries | Select-Object -First 3
            foreach ($entry in $preview) {
                $title = if ($entry.title) { $entry.title } else { '<untitled>' }
                $when = if ($entry.time) { $entry.time } elseif ($entry.date) { $entry.date } else { '-' }
                $lines += ('  - {0} @ {1}' -f $title, $when)
            }
            if ($count -gt $preview.Count) {
                $lines += ('  + {0} more' -f ($count - $preview.Count))
            }
        }
    }
    DwdmLauncher_WriteSection -Title 'Schedule' -Lines $lines
}

function DwdmLauncher_GetVersionLine {
    param([string]$Command, [string[]]$ArgumentList)
    try {
        $output = & $Command @ArgumentList 2>$null
        if ($null -eq $output) { return 'unknown' }
        $firstLine = ($output | Select-Object -First 1).ToString().Trim()
        if ([string]::IsNullOrWhiteSpace($firstLine)) { return 'unknown' }
        return $firstLine
    } catch {
        return 'not available'
    }
}

function DwdmLauncher_ShowEnvironmentInfo {
    param([string]$RepoRoot, [switch]$Dev)
    if ($Dev) {
        $mode = 'development (ts-node)'
    } else {
        $mode = 'production (compiled)'
    }

    $lines = @(
        ('Mode: {0}' -f $mode),
        ('Node: {0}' -f (DwdmLauncher_GetVersionLine -Command 'node' -ArgumentList @('-v'))),
        ('npm: {0}' -f (DwdmLauncher_GetVersionLine -Command 'npm' -ArgumentList @('-v')))
    )

    $envPath = Join-Path $RepoRoot '.env'
    if (Test-Path $envPath) {
        $envStatus = 'present'
    } else {
        $envStatus = 'missing'
    }

    $lines += ('Env file: {0}' -f $envStatus)
    DwdmLauncher_WriteSection -Title 'Environment' -Lines $lines
}

function DwdmLauncher_EnsureCommand {
    param([string]$Command, [string]$Hint)
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Command '$Command' is required. $Hint"
    }
}

function DwdmLauncher_WriteStepHeader {
    param([string]$Title)
    Write-Host ''
    Write-Host ('-- ' + $Title) -ForegroundColor Green
}

$script:DwdmLauncher_LevelColors = @{
    debug = 'DarkGray'
    info  = 'Gray'
    warn  = 'Yellow'
    error = 'Red'
}

function DwdmLauncher_WriteLogLine {
    param([string]$Line, [switch]$IsError)
    if ([string]::IsNullOrWhiteSpace($Line)) { return }
    $text = $Line.TrimEnd()
    if ($IsError) {
        Write-Host $text -ForegroundColor Red
        return
    }
    if ($text -match '^{"') {
        try {
            $payload = $text | ConvertFrom-Json -ErrorAction Stop
            if ($payload.level) {
                $level = $payload.level.ToString()
            } else {
                $level = 'info'
            }
            $level = $level.ToLowerInvariant()
            $color = $script:DwdmLauncher_LevelColors[$level]
            if (-not $color) { $color = 'Gray' }
            $stamp = (Get-Date).ToString('HH:mm:ss')
            $label = '[{0}][{1}]' -f $stamp, $level.ToUpperInvariant()
            if ($payload.tag) { $label += '[' + $payload.tag + ']'
            }
            Write-Host ('{0} {1}' -f $label, $payload.message) -ForegroundColor $color
            if ($payload.error) {
                Write-Host ('       {0}' -f $payload.error) -ForegroundColor DarkGray
            }
            return
        } catch {
            # fall through to plain text rendering when JSON parsing fails
        }
    }
    if ($text -match '(?i)\b(error|fail(ed)?)\b') {
        Write-Host $text -ForegroundColor Red
    } elseif ($text -match '(?i)\bwarn(ing)?\b') {
        Write-Host $text -ForegroundColor Yellow
    } elseif ($text -match '(?i)ready') {
        Write-Host $text -ForegroundColor Cyan
    } else {
        Write-Host $text
    }
}

function DwdmLauncher_StartLoggedProcess {
    param(
        [string]$RepoRoot,
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$Title
    )
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $FilePath
    $psi.Arguments = [string]::Join(' ', $ArgumentList)
    $psi.WorkingDirectory = $RepoRoot
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $psi

    if (-not $process.Start()) {
        throw "Failed to start $Title"
    }

    DwdmLauncher_WriteStepHeader $Title

    try {
        while (-not $process.HasExited) {
            while (-not $process.StandardOutput.EndOfStream) {
                DwdmLauncher_WriteLogLine -Line $process.StandardOutput.ReadLine()
            }
            while (-not $process.StandardError.EndOfStream) {
                DwdmLauncher_WriteLogLine -Line $process.StandardError.ReadLine() -IsError
            }
            Start-Sleep -Milliseconds 60
        }
        while (-not $process.StandardOutput.EndOfStream) {
            DwdmLauncher_WriteLogLine -Line $process.StandardOutput.ReadLine()
        }
        while (-not $process.StandardError.EndOfStream) {
            DwdmLauncher_WriteLogLine -Line $process.StandardError.ReadLine() -IsError
        }
        $process.WaitForExit()
        return $process.ExitCode
    } finally {
        $process.Dispose()
    }
}

function DwdmLauncher_InvokeStep {
    param(
        [string]$RepoRoot,
        [string]$Title,
        [string]$Command,
        [string[]]$Arguments
    )
    $code = DwdmLauncher_StartLoggedProcess -RepoRoot $RepoRoot -FilePath $Command -ArgumentList $Arguments -Title $Title
    if ($code -ne 0) {
        throw "Step '$Title' failed with exit code $code"
    }
}

function DwdmLauncher_ShowFailure {
    param(
        [string]$Message,
        [System.Management.Automation.ErrorRecord]$ErrorRecord
    )
    $details = if ($ErrorRecord.Exception) { $ErrorRecord.Exception.Message } else { $ErrorRecord.ToString() }
    $block = @($Message, $details)
    if ($ErrorRecord.ScriptStackTrace) {
        $block += 'Stack trace:'
        $block += $ErrorRecord.ScriptStackTrace.Split([Environment]::NewLine) | Where-Object { $_ }
    }
    DwdmLauncher_WriteSection -Title 'Failure' -Lines $block -Color ([ConsoleColor]::Red)
}

function Invoke-DwdmLauncher {
    [CmdletBinding()]
    param(
        [string]$RepoRoot,
        [switch]$Dev,
        [switch]$SkipInstall,
        [switch]$NoPause,
        [switch]$VerboseStartup
    )

    Set-StrictMode -Version Latest
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Stop'

    if (-not $RepoRoot) {
        $scriptPath = $PSCommandPath
        if ([string]::IsNullOrWhiteSpace($scriptPath)) {
            $scriptPath = $MyInvocation.MyCommand.Path
        }
        if ($scriptPath) {
            $RepoRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
        }
    }

    if (-not $RepoRoot) {
        $RepoRoot = Get-Location
    }

    try {
        $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath
    } catch {
        throw "Unable to resolve repository root at '$RepoRoot'."
    }

    $repoRoot = $RepoRoot
    $originalLocation = Get-Location
    $transcriptPath = $null
    $transcriptOpened = $false

    $logDir = Join-Path $repoRoot 'logs'
    try {
        if (-not (Test-Path $logDir)) {
            $null = New-Item -Path $logDir -ItemType Directory -Force
        }
        $transcriptPath = Join-Path $logDir ("launcher-" + (Get-Date).ToString('yyyyMMdd-HHmmss') + '.log')
        Start-Transcript -Path $transcriptPath -Force | Out-Null
        $transcriptOpened = $true
    } catch {
        $transcriptPath = Join-Path $repoRoot 'launcher-last.log'
        $message = "Transcript unavailable: $($_.Exception.Message)"
        Set-Content -Path $transcriptPath -Value $message -Encoding UTF8
        Write-Warning $message
    }

    Set-Location $repoRoot

    try { $host.UI.RawUI.WindowTitle = 'DWDM Bot Launcher' } catch {}

    $botExitCode = $null
    $scriptExitCode = 0

    try {
        DwdmLauncher_WriteBanner 'DWDM Bot'

        DwdmLauncher_EnsureCommand -Command 'node' -Hint 'Install Node.js 18+ from https://nodejs.org/'
        DwdmLauncher_EnsureCommand -Command 'npm' -Hint 'npm ships with Node.js; reinstall Node.js if missing.'

        Write-Host 'Prerequisites OK.' -ForegroundColor DarkGray

        Write-Host 'Collecting environment details...' -ForegroundColor DarkGray
        DwdmLauncher_ShowEnvironmentInfo -RepoRoot $repoRoot -Dev:$Dev

        Write-Host 'Reading schedule snapshot...' -ForegroundColor DarkGray
        DwdmLauncher_ShowScheduleStatus -RepoRoot $repoRoot

        if ($VerboseStartup) {
            DwdmLauncher_WriteSection -Title 'Paths' -Lines @(
                ('Root: {0}' -f $repoRoot),
                ('Script: {0}' -f $PSCommandPath)
            ) -Color ([ConsoleColor]::DarkGray)
        }

        if (-not $SkipInstall) {
            DwdmLauncher_InvokeStep -RepoRoot $repoRoot -Title 'Installing dependencies (npm install)' -Command 'npm' -Arguments @('install')
        }

        if (-not $Dev) {
            DwdmLauncher_InvokeStep -RepoRoot $repoRoot -Title 'Compiling TypeScript (npm run build)' -Command 'npm' -Arguments @('run', 'build')
        }

        $runTitle = if ($Dev) { 'Starting bot (npm run dev)' } else { 'Starting bot (npm run start)' }
        $runArgs = if ($Dev) { @('run', 'dev') } else { @('run', 'start') }
        $botExitCode = DwdmLauncher_StartLoggedProcess -RepoRoot $repoRoot -FilePath 'npm' -ArgumentList $runArgs -Title $runTitle
        $scriptExitCode = $botExitCode

        DwdmLauncher_WriteSection -Title 'Process exit' -Lines @("Exit code: $botExitCode") -Color ([ConsoleColor]::DarkGreen)
    } catch {
        $scriptExitCode = if ($null -ne $botExitCode) { $botExitCode } else { 1 }
        DwdmLauncher_ShowFailure -Message 'Launcher halted.' -ErrorRecord $_
    } finally {
        $ErrorActionPreference = $previousErrorPreference
        Set-Location $originalLocation
        if ($transcriptOpened) {
            try {
                Stop-Transcript | Out-Null
            } catch {}
        }
        if ($transcriptPath) {
            Write-Host ''
            Write-Host ('Log saved to: {0}' -f $transcriptPath) -ForegroundColor DarkGray
        }
        if (-not $NoPause) {
            Write-Host ''
            if ($scriptExitCode -eq 0) {
                [void](Read-Host 'Bot stopped. Press Enter to close')
            } else {
                [void](Read-Host 'Press Enter to exit')
            }
        }
    }

    return $scriptExitCode
}
