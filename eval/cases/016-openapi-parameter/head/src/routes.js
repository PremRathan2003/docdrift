import { Router } from 'express';
import { search } from './catalog.js';

export const router = Router();

router.get('/products', (req, res) => {
  const text = String(req.query.search ?? '');
  res.json(search(text));
});
