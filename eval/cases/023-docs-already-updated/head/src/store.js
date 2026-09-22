const tasks = [];
let nextId = 1;

export function createTask(title, dueDate = null) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('title is required');
  }
  const task = { id: nextId++, title: title.trim(), done: false, dueDate, createdAt: Date.now() };
  tasks.push(task);
  return task;
}

export function listTasks({ limit = 20, offset = 0 } = {}) {
  return [...tasks].sort((a, b) => a.createdAt - b.createdAt).slice(offset, offset + limit);
}

export function deleteTask(id) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;
  tasks.splice(index, 1);
  return true;
}
