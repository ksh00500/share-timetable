import { resolve } from 'node:path';
import { createApp } from './app.js';
import { createStore } from './store.js';

const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || './data';
const store = createStore(resolve(dataDir, 'timetable.sqlite'));
const app = await createApp({ store, adminPassword: process.env.ADMIN_PASSWORD });

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log('Share Timetable listening on port ' + port);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  await app.close();
}
