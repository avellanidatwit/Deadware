[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')]
param([ValidatePattern('^[A-Za-z][A-Za-z0-9_-]{0,63}$')][string]$Name='Deadware')
$ErrorActionPreference='Stop'
$service=Get-Service -Name $Name -ErrorAction Stop
if (!$PSCmdlet.ShouldProcess($Name,'Stop and unregister Windows service; retain application, logs and database')) { return }
if ($service.Status -ne 'Stopped') { Stop-Service -Name $Name; $service.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(40)) }
& sc.exe delete $Name
if ($LASTEXITCODE -ne 0) { throw 'Service removal failed. Run in an elevated PowerShell terminal.' }
