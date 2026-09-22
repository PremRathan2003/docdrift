import { Router } from 'express';
import { archiveTask, createTask, listTasks } from './store.js';

export const router = Router();

router.get('/tasks', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);
  res.json(listTasks({ limit, offset }));
});

router.post('/tasks', (req, res) => {
  const task = createTask(req.body.title);
  res.status(200).json(task);
});

router.post('/tasks/:id/archive', (req, res) => {
  const ok = archiveTask(Number(req.params.id));
  res.status(ok ? 204 : 404).end();
});
