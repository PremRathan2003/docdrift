import { Router } from 'express';
import { search } from './catalog.js';

export const router = Router();

router.get('/products', (req, res) => {
  const q = String(req.query.q ?? '');
  res.json(search(q));
});
