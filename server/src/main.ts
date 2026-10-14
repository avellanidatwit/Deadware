import { configuration } from './config/environment.js';
import { startServer } from './server.js';
import { serviceControl } from './serviceControl.js';
async function main() {
  let closeControl = () => {};
  const running = await startServer(configuration(), () => {
    process.exitCode = 1;
    closeControl();
  });
  const stop = async () => {
    closeControl();
    try {
      await running.stop();
    } catch {
      process.exitCode = 1;
      console.error(JSON.stringify({ event: 'shutdown_failed' }));
    }
  };
  if (process.argv.includes('--windows-service'))
    closeControl = serviceControl(process.stdin, stop);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void stop();
    });
}
void main().catch(() => {
  console.error(
    JSON.stringify({
      event: 'startup_failed',
      message:
        'Check environment configuration, restricted database role, migrations, world timing and port availability.',
    }),
  );
  process.exitCode = 1;
});
