# Windows service and manual startup

Deadware can run unattended under Windows Service Control Manager, starting after Windows boots. Manual `npm start` remains available. Both launch the same authoritative Node server and use the existing PostgreSQL advisory lock, so they cannot simultaneously write one world.

## Deploy once

Use a stable dedicated deployment directory, such as `C:\Deadware`, outside a user profile or OneDrive. The installer intentionally refuses user-profile/synchronized deployments because the built-in LocalService account must be able to read the application before any user signs in. Keep this development checkout where it is; deploy a separate checkout/copy for the service.

Requirements: Node.js 24+, .NET Framework 4.x, configured PostgreSQL, installed project dependencies, migrated database, and a valid `.env`. Install Node in a machine-wide readable location. The service runs as `NT AUTHORITY\LocalService`, not LocalSystem. It reads application/config files, writes only its log directory, and accesses PostgreSQL with the restricted application role already configured in `.env`.

Prepare in the deployment directory:

```powershell
cd C:\Deadware
npm.cmd ci
# Configure .env using the existing README, then apply any needed migrations.
npm.cmd run build:server
```

Find the actual local PostgreSQL service name if you want Windows to start it first:

```powershell
Get-Service *postgres*
```

Open an elevated Windows PowerShell terminal to register the service. Substitute the dependency name reported on your machine; omit DependsOn if PostgreSQL is remote or started independently.

```powershell
cd C:\Deadware
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Install-Service.ps1 -DependsOn postgresql-x64-17 -StartNow
```

`-WhatIf` previews registration, access grants and recovery configuration without making them. Installation compiles the small native .NET host, registers delayed automatic startup, and configures restart delays of 5, 15 and 60 seconds after failures. Stop any manually running server before using StartNow. StartNow is optional; without it, the service starts on the next boot or explicit Start-Service. The Node process is started directly from built JavaScript; startup does not run npm builds or migrations.

The installer grants LocalService read/execute access inherited through the dedicated deployment tree and modify access to `C:\ProgramData\Deadware\logs`. It does not expose a network shutdown endpoint, move credentials, change database roles or bind the application to a new address. Existing reverse-proxy/HTTPS configuration still applies.

Service name defaults to Deadware; `-Name` supports a separate deployment name. `-ProjectPath`, `-NodePath`, `-DependsOn`, `-ServiceHostPath` and `-StartNow` are explicit options. Existing registrations are rejected; removal/reinstallation is deliberate. npm aliases `service:build`, `service:install` and `service:remove` are Windows-only convenience commands.

## Signing and Windows Application Control

A custom compiled executable may require an organization-approved Authenticode signature or explicit application-policy approval on managed Windows installations. Initial local builds were blocked by Windows Code Integrity signing policy. The final compiled host subsequently passed its native child-process readiness/graceful-stop self-test, and script parsing was verified. A real SCM installation/boot test has not been performed here. Do not disable the machine's security policy to install it.

For a managed deployment, build first, sign/approve the executable using your organization's process, then preserve that binary during installation:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Build-ServiceHost.ps1
# Sign/approve scripts/windows/build/Deadware.Service.exe using your trusted signing process.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Install-Service.ps1 -ServiceHostPath C:\Deadware\scripts\windows\build\Deadware.Service.exe -StartNow
```

Providing ServiceHostPath skips recompilation so it does not overwrite an approved signature. The service account also needs read/execute access to that path if it is outside the deployment directory. PowerShell ExecutionPolicy Bypass above applies only to that invocation; it does not bypass Windows Application Control or change system policy.

## Operate and update

```powershell
Get-Service Deadware
Start-Service Deadware
Stop-Service Deadware
Restart-Service Deadware
Get-Content C:\ProgramData\Deadware\logs\server.log -Tail 50 -Wait
```

The host waits for the server_started readiness message. Startup failures exit nonzero so Windows recovery can retry. Stop and machine shutdown send a private stdin command to Node; the existing shutdown path stops ticks, closes HTTP, waits for queued world work, writes its final checkpoint, and closes database/session resources. Loss of the parent pipe also initiates shutdown, avoiding an orphaned writer. The host waits up to 25 seconds before forced termination; hard power loss or a forced timeout can only preserve the last successful checkpoint. A log file larger than 10 MiB rotates at service startup to server.log.1.

Before updating, stop the service. Update source/dependencies, build the server, run required migrations, then start it. If the service host changes, rebuild and reapprove/sign it as required. Never overwrite a running host executable.

## Switch to manual startup

```powershell
Stop-Service Deadware
cd C:\Deadware
npm.cmd start
# Ctrl+C gracefully stops the manual server.
```

After the manual process exits, Start-Service Deadware restores unattended operation. The advisory lock rejects accidental overlap. No service flags or stdin control listener are enabled during ordinary npm start.

To unregister (elevated terminal):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Remove-Service.ps1
```

Removal stops the service and deletes only its registration. Application files, database, logs and explicit access grants remain. Use -WhatIf to preview or -Confirm:$false for explicitly authorized unattended removal. Service registration/startup and reboot verification require a suitable administrator-controlled deployment machine.

## Verification

Node tests verify the stop command is one-shot, parent-pipe loss stops the server, and management scripts parse. The native host compiles against Windows' .NET Framework. A self-test exercises readiness and graceful stop with a temporary child on Windows where execution is allowed; it explicitly skips when Code Integrity logs confirm an application-policy block. It never registers a service. Linux CI skips Windows-only checks and still tests the Node stop channel.

The host follows Microsoft's [ServiceBase stop lifecycle](https://learn.microsoft.com/en-us/dotnet/api/system.serviceprocess.servicebase.onstop?view=netframework-4.8.1). Service setup uses Windows New-Service and sc.exe rather than introducing another Node service dependency.
