import { listTasks } from './store.js';

export function stats() {
  let openTasks = 0;
  for (const task of listTasks({ limit: Infinity })) {
    if (!task.done) openTasks++;
  }
  return { open: openTasks };
}
