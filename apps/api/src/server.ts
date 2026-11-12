import { buildApp } from './app.js';
import { openFirestore } from './firestore.js';
import { ltiConfigFromEnv } from './lti.js';

const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'demo-arena';
const databaseId = process.env.FIRESTORE_DATABASE ?? '(default)';
const port = Number(process.env.PORT ?? 8080);

const app = await buildApp({ db: openFirestore(projectId, databaseId), logger: true, lti: ltiConfigFromEnv(process.env) });
await app.listen({ host: '0.0.0.0', port });
