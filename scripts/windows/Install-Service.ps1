[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_-]{0,63}$')][string]$Name = 'Deadware',
    [string]$ProjectPath = '',
    [string]$NodePath = (Get-Command node.exe -ErrorAction Stop).Source,
    [string[]]$DependsOn = @(),
    [string]$ServiceHostPath = '',
    [switch]$StartNow
)
$ErrorActionPreference = 'Stop'
if (!$ProjectPath) { $ProjectPath=Join-Path $PSScriptRoot '../..' }
$root = (Resolve-Path -LiteralPath $ProjectPath).Path
$node = (Resolve-Path -LiteralPath $NodePath).Path
$logs = Join-Path $env:ProgramData "$Name/logs"
$binary = if ($ServiceHostPath) { (Resolve-Path -LiteralPath $ServiceHostPath).Path } else { Join-Path $root 'scripts/windows/build/Deadware.Service.exe' }
if (Get-Service -Name $Name -ErrorAction SilentlyContinue) { throw "Service $Name already exists. Remove it explicitly before reinstalling." }
if ($root.StartsWith([Environment]::GetFolderPath('UserProfile') + '\', [StringComparison]::OrdinalIgnoreCase) -or $root -match '(?i)\\OneDrive(?:\\|$)') {
    throw 'Deploy to a stable dedicated folder outside user profiles/OneDrive, for example C:\Deadware. The service runs as LocalService.'
}
foreach ($required in @('.env','dist/server/src/main.js')) { if (!(Test-Path -LiteralPath (Join-Path $root $required))) { throw "Missing $required. Install dependencies, build the server and configure .env first." } }
foreach ($dependency in $DependsOn) { Get-Service -Name $dependency -ErrorAction Stop | Out-Null }
if (!$PSCmdlet.ShouldProcess($Name, "Install automatic Windows service from $root as LocalService, grant read access and configure restart recovery")) { return }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run installation in an elevated PowerShell terminal.' }
if (!$ServiceHostPath) { & (Join-Path $PSScriptRoot 'Build-ServiceHost.ps1') -OutputPath $binary | Out-Null }
New-Item -ItemType Directory -Force -Path $logs | Out-Null
# LocalService can read application/config files but can only write service logs.
& icacls.exe $root /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant service read access.' }
& icacls.exe $logs /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to grant log directory access.' }
$command = '"{0}" "{1}" "{2}" "{3}" "{4}"' -f $binary,$Name,$root,$node,$logs
$credential = New-Object System.Management.Automation.PSCredential('NT AUTHORITY\LocalService',(New-Object Security.SecureString))
$params = @{Name=$Name;DisplayName="$Name simulation server";BinaryPathName=$command;StartupType='Automatic';Credential=$credential;Description='Authoritative Deadware server with checkpointed graceful shutdown.'}
if ($DependsOn.Count) { $params.DependsOn=$DependsOn }
New-Service @params | Out-Null
& sc.exe config $Name start= delayed-auto | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to configure delayed automatic startup.' }
& sc.exe failure $Name reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to configure restart recovery.' }
& sc.exe failureflag $Name 1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to configure failure recovery.' }
if ($StartNow) { Start-Service -Name $Name }
Get-Service -Name $Name
Write-Output "Logs: $logs/server.log. Manual startup remains available with npm start while the service is stopped."
