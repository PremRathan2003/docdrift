import { Router } from 'express';
import { createUser, getUser } from './users.js';

export const router = Router();

router.post('/users', (req, res) => res.status(201).json(createUser(req.body)));
router.get('/users/:id', (req, res) => {
  const user = getUser(req.params.id);
  return user ? res.json(user) : res.status(404).end();
});
