import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { db } from './db.js';
import projectsRouter from './routes/projects.js';

// ensure store initializes
void db;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, allowedRoots: config.allowedRoots });
});

app.use('/api/projects', projectsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || '서버 오류' });
});

app.listen(config.port, () => {
  console.log(`program-spec-server listening on http://localhost:${config.port}`);
  console.log(`allowed roots: ${config.allowedRoots.join('; ')}`);
});
