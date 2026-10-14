[CmdletBinding()]
param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
if (!$OutputPath) { $OutputPath=Join-Path $PSScriptRoot 'build/Deadware.Service.exe' }
$frameworkDirectory = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$compiler = Join-Path $frameworkDirectory 'csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework 4.x is required to build the service host.' }
$destination = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
& $compiler /nologo /target:winexe /optimize+ "/out:$destination" "/reference:$frameworkDirectory/System.ServiceProcess.dll" (Join-Path $PSScriptRoot 'DeadwareService.cs')
if ($LASTEXITCODE -ne 0) { throw 'Service host compilation failed.' }
Write-Output $destination
