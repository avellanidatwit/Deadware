import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join, relative, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
const exec = promisify(execFile);
// Windows postmaster inherits pipes: wait for pg_ctl's exit, not pipe closure.
const control = (binary, args) =>
  new Promise((done, reject) => {
    const child = spawn(binary, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? done() : reject(new Error('PostgreSQL control failed.')),
    );
  });
const runTests = (env) =>
  new Promise((resolveCode, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--test',
        'tests/postgres.test.mjs',
        'tests/account.test.mjs',
        'tests/server-startup.test.mjs',
      ],
      { env, stdio: 'inherit', windowsHide: true },
    );
    child.on('error', reject);
    child.on('exit', (code) => resolveCode(code ?? 1));
  });
if (process.env.TEST_DATABASE_URL) {
  process.exitCode = await runTests(process.env);
} else {
  const base = resolve('test-results');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'pg-')),
    data = join(root, 'data'),
    pwfile = join(root, 'password');
  const bin =
    process.env.PG_BIN ??
    (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
  const binary = (name) =>
    bin ? join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
  const password = randomBytes(24).toString('hex');
  let started = false,
    stage = 'initialize';
  try {
    await writeFile(pwfile, password, { mode: 0o600 });
    await exec(
      binary('initdb'),
      [
        '-D',
        data,
        '-U',
        'deadware_test',
        `--pwfile=${pwfile}`,
        '--auth=scram-sha-256',
        '--encoding=UTF8',
        '--no-locale',
      ],
      { windowsHide: true },
    );
    const port = await new Promise((done, reject) => {
      const server = net.createServer();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(() => done(port));
      });
    });
    stage = 'start';
    await control(binary('pg_ctl'), [
      '-D',
      data,
      '-l',
      join(root, 'postgres.log'),
      '-w',
      '-t',
      '30',
      '-o',
      `-h 127.0.0.1 -p ${port}`,
      'start',
    ]);
    started = true;
    console.log(
      'Isolated PostgreSQL test cluster ready on loopback. Existing game data is untouched.',
    );
    process.exitCode = await runTests({
      ...process.env,
      TEST_DATABASE_URL: `postgresql://deadware_test:${password}@127.0.0.1:${port}/postgres`,
    });
  } catch (error) {
    console.error(
      `Integration setup failed at ${stage}. Check PostgreSQL tools/PG_BIN. No credentials printed.`,
    );
    if (error.stderr) console.error(error.stderr.replaceAll(password, '[redacted]').slice(-1500));
    else console.error(error.code ?? 'Unknown setup error');
    process.exitCode = 1;
  } finally {
    if (started)
      await control(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']).catch(
        () => {
          throw new Error('Test PostgreSQL did not stop; its files were retained.');
        },
      );
    const inside = relative(base, root);
    if (!inside || inside.startsWith('..') || !basename(root).startsWith('pg-'))
      throw new Error('Refusing cleanup outside isolated test directory.');
    await rm(root, { recursive: true, force: true });
  }
}
