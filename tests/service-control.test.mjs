import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { serviceControl } from '../dist/server/src/serviceControl.js';
const exec = promisify(execFile);
test('service stdin stop requests graceful shutdown once, without a network control surface', async () => {
  const input = new PassThrough();
  let stops = 0;
  const close = serviceControl(input, async () => {
    stops++;
  });
  input.write('unrecognized\nDEADWARE_STOP\nDEADWARE_STOP\n');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stops, 1);
  close();
  input.destroy();
});
test(
  'native Windows host compiles and starts/stops a real child through its private pipe',
  { skip: process.platform !== 'win32', timeout: 60000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'deadware service test '));
    try {
      await mkdir(join(root, 'dist/server/src'), { recursive: true });
      await writeFile(join(root, '.env'), '');
      await writeFile(
        join(root, 'dist/server/src/main.js'),
        `const fs=require('node:fs'); if(!process.argv.includes('--windows-service'))process.exit(3);process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{if(data.includes('DEADWARE_STOP')){fs.writeFileSync('checkpoint-confirmed','saved');process.exit(0);}});console.log(JSON.stringify({event:'server_started'}));`,
      );
      await exec(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          resolve('scripts/windows/Build-ServiceHost.ps1'),
        ],
        { windowsHide: true },
      );
      try {
        await exec(
          resolve('scripts/windows/build/Deadware.Service.exe'),
          ['--self-test', 'DeadwareTest', root, process.execPath, join(root, 'logs')],
          { windowsHide: true, timeout: 45000 },
        );
      } catch (error) {
        if (error.code === 'UNKNOWN') {
          const diagnostic = await exec(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              "Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-CodeIntegrity/Operational';StartTime=(Get-Date).AddMinutes(-5)} -ErrorAction SilentlyContinue | Where-Object { $_.Message -like '*Deadware.Service.exe*' } | Select-Object -First 1 -ExpandProperty Message",
            ],
            { windowsHide: true },
          ).catch(() => ({ stdout: '' }));
          if (/signing level requirements|code integrity policy/i.test(diagnostic.stdout)) {
            t.skip(
              'Windows Application Control blocks the locally compiled service executable; trusted signing is required.',
            );
            return;
          }
        }
        throw error;
      }
      assert.equal(await readFile(join(root, 'checkpoint-confirmed'), 'utf8'), 'saved');
      const log = await readFile(join(root, 'logs/server.log'), 'utf8');
      assert.match(log, /Windows host ready/);
      assert.match(log, /graceful shutdown/);
    } finally {
      assert.equal(dirname(root), resolve(tmpdir()));
      assert.ok(basename(root).startsWith('deadware service test '));
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  'Windows service management scripts parse without registering or changing services',
  { skip: process.platform !== 'win32' },
  async () => {
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "$ErrorActionPreference='Stop'; Get-ChildItem -LiteralPath scripts/windows -Filter *.ps1 | ForEach-Object { $tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors) | Out-Null; if($errors.Count){throw ($errors | Out-String)} }; Write-Output 'parsed'",
      ],
      { windowsHide: true },
    );
    assert.match(stdout, /parsed/);
  },
);

test('loss of the Windows parent pipe checkpoints instead of leaving an orphan server', async () => {
  const input = new PassThrough();
  let stops = 0;
  serviceControl(input, async () => {
    stops++;
  });
  input.end();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stops, 1);
});
