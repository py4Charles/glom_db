$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "No .env at $envPath. Copy .env.example and fill in DATABASE_URL."
}

$line = Get-Content -LiteralPath $envPath | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
if (-not $line) { throw "DATABASE_URL is not set in $envPath" }

$cs = ($line -split '=', 2)[1].Trim()
$u = [regex]::Match($cs, '^postgresql://(?<user>[^:]+):(?<pw>[^@]*)@(?<host>[^:]+):(?<port>\d+)/(?<db>[^?]+)')
if (-not $u.Success) { throw "Could not parse DATABASE_URL: $cs" }

$env:PGUSER     = $u.Groups['user'].Value
$env:PGPASSWORD = $u.Groups['pw'].Value
$env:PGHOST     = $u.Groups['host'].Value
$env:PGPORT     = $u.Groups['port'].Value
$env:PGDATABASE = $u.Groups['db'].Value

foreach ($name in 'PGUSER', 'PGPASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE') {
  if ([string]::IsNullOrEmpty((Get-Item "env:$name").Value)) {
    throw "$name resolved to empty. Refusing to run: libpq reads an empty value as 'use my default', which silently retargets the connection at localhost."
  }
}

"target: $($env:PGHOST):$($env:PGPORT)/$($env:PGDATABASE) as $env:PGUSER"
