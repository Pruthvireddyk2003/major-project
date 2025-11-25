param(
    [string]$DatabaseUrl   = "file:./dev.db",
    [string]$MigrationName = "init",
    [switch]$ResetDb,
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$SkipSeed,
    [switch]$ForceEnv
)

$ErrorActionPreference = "Stop"

function Log {
    param(
        [string]$Msg,
        [string]$Level = "info"
    )

    switch ($Level) {
        "step" { Write-Host ""; Write-Host "=== $Msg ===" -ForegroundColor Cyan }
        "ok"   { Write-Host "[OK]    $Msg" -ForegroundColor Green }
        "warn" { Write-Host "[WARN]  $Msg" -ForegroundColor Yellow }
        "err"  { Write-Host "[ERROR] $Msg" -ForegroundColor Red }
        default { Write-Host "$Msg" }
    }
}

try {
    Log -Msg "Setting execution policy (process only)" -Level "step"
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
    Log -Msg "Execution policy enabled" -Level "ok"

    Log -Msg "Ensuring .env file exists" -Level "step"

    $envPath = ".env"

    if (!(Test-Path $envPath -PathType Leaf)) {
        Log -Msg ".env not found. Creating a new one." -Level "warn"
        New-Item -Path $envPath -ItemType File -Force | Out-Null

        $jwt = [guid]::NewGuid().ToString("N")

        @"
DATABASE_URL="$DatabaseUrl"
JWT_SECRET="$jwt"
"@ | Set-Content $envPath

        Log -Msg ".env created with DATABASE_URL + JWT_SECRET" -Level "ok"
    }
    else {
        if ($ForceEnv) {
            Log -Msg ".env exists. Overwriting due to -ForceEnv." -Level "warn"

            $jwt = [guid]::NewGuid().ToString("N")

            @"
DATABASE_URL="$DatabaseUrl"
JWT_SECRET="$jwt"
"@ | Set-Content $envPath

            Log -Msg ".env overwritten successfully" -Level "ok"
        }
        else {
            Log -Msg ".env already exists. Keeping existing values." -Level "warn"
        }
    }

    Log -Msg "Applying DATABASE_URL to environment" -Level "step"
    $env:DATABASE_URL = $DatabaseUrl
    Log -Msg "DATABASE_URL set to $DatabaseUrl" -Level "ok"

    if ($ResetDb) {
        Log -Msg "Resetting database file" -Level "step"

        if ($DatabaseUrl -match "file:(.+)") {
            $dbPath = $Matches[1].Trim()
            if (Test-Path $dbPath) {
                Remove-Item $dbPath -Force
                Log -Msg "Deleted DB file: $dbPath" -Level "ok"
            }
            else {
                Log -Msg "No DB file at $dbPath (skipping)" -Level "warn"
            }
        }
        else {
            Log -Msg "DATABASE_URL is not a file: URL (skipping)" -Level "warn"
        }
    }

    if (-not $SkipInstall) {
        Log -Msg "Running npm install" -Level "step"
        npm install
        Log -Msg "npm install completed" -Level "ok"
    }
    else {
        Log -Msg "Skipping npm install" -Level "warn"
    }

    Log -Msg "Running prisma generate" -Level "step"
    npx prisma generate
    Log -Msg "Prisma client generated" -Level "ok"

    Log -Msg "Applying migrations: $MigrationName" -Level "step"
    npx prisma migrate dev --name $MigrationName
    Log -Msg "Migrations applied" -Level "ok"

    if (-not $SkipSeed) {
        Log -Msg "Seeding database" -Level "step"
        npm run seed
        Log -Msg "Database seeded successfully" -Level "ok"
    }
    else {
        Log -Msg "Skipping seed" -Level "warn"
    }

    if (-not $SkipBuild) {
        Log -Msg "Building project" -Level "step"
        npm run build
        Log -Msg "Build complete" -Level "ok"
    }
    else {
        Log -Msg "Skipping build" -Level "warn"
    }

    Log -Msg "Starting application" -Level "step"
    Log -Msg "Press CTRL+C to stop server" -Level "warn"
    npm run start

    Log -Msg "Setup completed successfully" -Level "ok"
}
catch {
    Log -Msg "Script failed: $($_.Exception.Message)" -Level "err"
    exit 1
}
