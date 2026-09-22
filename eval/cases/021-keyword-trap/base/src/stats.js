import { listTasks } from './store.js';

export function stats() {
  let count = 0;
  for (const task of listTasks({ limit: Infinity })) {
    if (!task.done) count++;
  }
  return { open: count };
}
