import { configuration } from '../config/environment.js';
import { connect } from './connection.js';
import { resetWorld } from './repositories/resetWorld.js';

async function main() {
  const pool = connect(configuration());
  try {
    await resetWorld(pool);
    console.log(
      'World reset. All entities, queued spawns, saved programs and death archives were removed. User accounts remain.',
    );
    console.log('Run npm start to generate a new map, then refresh the website.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  if (error instanceof Error && error.message.startsWith('Stop the game server'))
    console.error(error.message);
  else
    console.error(
      'World reset failed. Check the database settings in .env, PostgreSQL availability and database permissions.',
    );
  process.exitCode = 1;
});
