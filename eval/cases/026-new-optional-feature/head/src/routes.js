import { Router } from 'express';
import { createTask, deleteTask, listTasks } from './store.js';

export const router = Router();

router.get('/tasks', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);
  const done = req.query.done === undefined ? undefined : req.query.done === 'true';
  res.json(listTasks({ limit, offset, done }));
});

router.post('/tasks', (req, res) => {
  const task = createTask(req.body.title);
  res.status(200).json(task);
});

router.delete('/tasks/:id', (req, res) => {
  const ok = deleteTask(Number(req.params.id));
  res.status(ok ? 204 : 404).end();
});
