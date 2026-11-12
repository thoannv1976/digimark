import { buildApp } from './app.js';
import { openFirestore } from './firestore.js';

const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'demo-arena';
const databaseId = process.env.FIRESTORE_DATABASE ?? '(default)';
const port = Number(process.env.PORT ?? 8080);

const app = await buildApp({ db: openFirestore(projectId, databaseId), logger: true });
await app.listen({ host: '0.0.0.0', port });
