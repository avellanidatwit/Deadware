import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
/** Private inherited stdin pipe from the Windows host; no network stop endpoint. */
export function serviceControl(input: Readable, stop: () => Promise<void>): () => void {
  const lines = createInterface({ input, crlfDelay: Infinity });
  let stopping = false;
  const requestStop = () => {
    if (stopping) return;
    stopping = true;
    lines.removeListener('close', requestStop);
    lines.close();
    input.pause();
    void stop().catch(() => {
      process.exitCode = 1;
    });
  };
  lines.on('line', (line) => {
    if (line === 'DEADWARE_STOP') requestStop();
  });
  // If the host crashes, its pipe closes: checkpoint instead of leaving an orphan writer.
  lines.once('close', requestStop);
  return () => {
    lines.removeListener('close', requestStop);
    lines.close();
    input.pause();
  };
}
