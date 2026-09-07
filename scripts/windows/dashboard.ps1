param(
    [ValidateSet('start', 'stop', 'status', 'logs')]
    [string]$Action = 'status',
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
try {
    # Resolve from this script, never the caller's working directory.
    $Repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
    if (-not $NodePath) {
        $NodePath = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    }
    if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
        throw 'Node.js executable not found.'
    }
    $Runner = Join-Path $PSScriptRoot 'dashboard.mjs'
    Push-Location -LiteralPath $Repository
    try {
        # The call operator passes each path as one argument, including spaces.
        & $NodePath $Runner $Action
        $Result = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    exit $Result
}
catch {
    # Do not dump exception objects or environment variables into scheduled logs.
    Write-Host 'Dashboard launcher failed. Check the repository path, permissions and -NodePath (Node.js 24 or later).'
    exit 1
}
