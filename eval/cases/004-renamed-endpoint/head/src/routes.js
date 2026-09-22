import { Router } from 'express';
import { createUser, getUser } from './users.js';

export const router = Router();

router.post('/accounts', (req, res) => res.status(201).json(createUser(req.body)));
router.get('/accounts/:id', (req, res) => {
  const user = getUser(req.params.id);
  return user ? res.json(user) : res.status(404).end();
});
