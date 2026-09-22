const tasks = [];
let nextId = 1;

export function createTask(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('title is required');
  }
  const task = { id: nextId++, title: title.trim(), done: false, createdAt: Date.now() };
  tasks.push(task);
  return task;
}

export function listTasks({ limit = 20, offset = 0 } = {}) {
  return [...tasks].sort((a, b) => a.createdAt - b.createdAt).slice(offset, offset + limit);
}

export function deleteTask(id) {
  const index = tasks.findIndex(({ id: taskId }) => taskId === id);
  if (index < 0) return false;
  tasks.splice(index, 1);
  return true;
}
