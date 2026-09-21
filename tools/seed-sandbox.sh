#!/usr/bin/env bash
# Seeds your docdrift-sandbox repository with a small Express API and three
# branches whose pull requests exercise DocDrift:
#   1. rename-done-to-completed  - API response changes, README NOT updated   (docs drift)
#   2. refactor-task-store       - internal refactor, behaviour unchanged    (no docs impact)
#   3. rename-limit-env-var      - config variable renamed, docs NOT updated (docs drift)
# These also become the first labelled cases of the evaluation dataset (Phase 2).
#
# Usage:  bash tools/seed-sandbox.sh /path/to/your/docdrift-sandbox-clone
set -euo pipefail

REPO_DIR="${1:?Usage: bash tools/seed-sandbox.sh /path/to/docdrift-sandbox}"
cd "$REPO_DIR"
git rev-parse --is-inside-work-tree >/dev/null
if [ -n "$(git status --porcelain)" ]; then echo "✗ $REPO_DIR has uncommitted changes; aborting." >&2; exit 1; fi
if git ls-remote --exit-code --heads origin rename-done-to-completed >/dev/null 2>&1; then
  echo "✗ The branches already exist on GitHub; this script only runs once." >&2; exit 1
fi
git checkout -q main
git pull -q --ff-only

mkdir -p src/routes docs

# ---------------------------------------------------------------- main
cat > package.json <<'EOF'
{
  "name": "task-api",
  "version": "1.0.0",
  "private": true,
  "description": "A tiny task tracker API used to test DocDrift.",
  "main": "src/server.js",
  "scripts": { "start": "node src/server.js" },
  "dependencies": { "express": "^5.1.0" }
}
EOF

cat > .gitignore <<'EOF'
node_modules/
.env
EOF

cat > src/store.js <<'EOF'
// In-memory task store. Data is lost when the server restarts.
const limit = Number(process.env.TASKS_LIMIT ?? 100);

let nextId = 1;
const tasks = [];

function listTasks() {
  return tasks;
}

function createTask(title) {
  if (tasks.length >= limit) {
    throw new Error(`Task limit of ${limit} reached`);
  }
  const task = { id: nextId++, title, done: false, createdAt: new Date().toISOString() };
  tasks.push(task);
  return task;
}

function markDone(id) {
  const task = tasks.find((t) => t.id === id);
  if (task) task.done = true;
  return task;
}

module.exports = { listTasks, createTask, markDone };
EOF

cat > src/routes/tasks.js <<'EOF'
const express = require('express');
const store = require('../store');

const router = express.Router();

// GET /tasks - list all tasks
router.get('/', (req, res) => {
  res.json(store.listTasks());
});

// POST /tasks - create a task. Body: { "title": "..." }
router.post('/', (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    res.status(201).json(store.createTask(title.trim()));
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// POST /tasks/:id/done - mark a task as done
router.post('/:id/done', (req, res) => {
  const task = store.markDone(Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'task not found' });
  res.json(task);
});

module.exports = router;
EOF

cat > src/server.js <<'EOF'
const express = require('express');
const tasks = require('./routes/tasks');

const app = express();
app.use(express.json());
app.use('/tasks', tasks);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Task API listening on http://localhost:${port}`));
EOF

cat > README.md <<'EOF'
# Task API

A tiny task tracker API, used as a test repository for DocDrift.

## Running

```bash
npm install
npm start
```

The server listens on port 3000 by default. See [docs/configuration.md](docs/configuration.md).

## Endpoints

### `GET /tasks`

Returns all tasks.

```json
[
  { "id": 1, "title": "Write docs", "done": false, "createdAt": "2026-09-21T10:00:00.000Z" }
]
```

### `POST /tasks`

Creates a task. Request body:

```json
{ "title": "Write docs" }
```

Responds `201 Created` with the new task:

```json
{ "id": 1, "title": "Write docs", "done": false, "createdAt": "2026-09-21T10:00:00.000Z" }
```

Returns `400` if `title` is missing and `409` when the task limit is reached.

### `POST /tasks/:id/done`

Marks a task as done and returns it with `"done": true`. Returns `404` for an unknown id.
EOF

cat > docs/configuration.md <<'EOF'
# Configuration

The API is configured with environment variables.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port the HTTP server listens on. |
| `TASKS_LIMIT` | `100` | Maximum number of tasks that can be stored. |
EOF

git add -A
git commit -q -m "Add task API with README and configuration docs"
git push -q origin main
echo "✓ main: task API pushed"

# ---------------------------------------------------------------- PR 1: API change, docs not updated
git checkout -q -b rename-done-to-completed main
sed -i.bak 's/done: false, createdAt/completed: false, priority, createdAt/' src/store.js
sed -i.bak "s/function createTask(title) {/function createTask(title, priority = 'medium') {/" src/store.js
sed -i.bak 's/if (task) task.done = true;/if (task) task.completed = true;/' src/store.js
sed -i.bak 's/^function markDone(id) {/function markCompleted(id) {/' src/store.js
sed -i.bak 's/module.exports = { listTasks, createTask, markDone };/module.exports = { listTasks, createTask, markCompleted };/' src/store.js
python3 - <<'EOF'
import re
p = 'src/routes/tasks.js'
s = open(p).read()
s = s.replace('// POST /tasks - create a task. Body: { "title": "..." }',
              '// POST /tasks - create a task. Body: { "title": "...", "priority": "low" | "medium" | "high" }')
s = s.replace("  const { title } = req.body ?? {};", "  const { title, priority = 'medium' } = req.body ?? {};")
s = s.replace("""    return res.status(400).json({ error: 'title is required' });
  }""", """    return res.status(400).json({ error: 'title is required' });
  }
  if (!['low', 'medium', 'high'].includes(priority)) {
    return res.status(400).json({ error: 'priority must be low, medium or high' });
  }""")
s = s.replace("store.createTask(title.trim())", "store.createTask(title.trim(), priority)")
s = s.replace("// POST /tasks/:id/done - mark a task as done", "// POST /tasks/:id/complete - mark a task as completed")
s = s.replace("router.post('/:id/done',", "router.post('/:id/complete',")
s = s.replace("store.markDone(", "store.markCompleted(")
open(p, 'w').write(s)
EOF
rm -f src/*.bak src/routes/*.bak
git add -A
git commit -q -m "Rename done to completed, add task priority"
git push -q -u origin rename-done-to-completed
echo "✓ branch rename-done-to-completed pushed"

# ---------------------------------------------------------------- PR 2: refactor only, no docs impact
git checkout -q -b refactor-task-store main
python3 - <<'EOF'
p = 'src/store.js'
s = open(p).read()
s = s.replace("""function markDone(id) {
  const task = tasks.find((t) => t.id === id);
  if (task) task.done = true;
  return task;
}""", """function findTask(id) {
  return tasks.find((t) => t.id === id);
}

function markDone(id) {
  const task = findTask(id);
  if (task) task.done = true;
  return task;
}""")
s = s.replace("let nextId = 1;\nconst tasks = [];", "// Ids start at 1 and are never reused.\nlet nextId = 1;\nconst tasks = [];")
open(p, 'w').write(s)
EOF
git add -A
git commit -q -m "Extract findTask helper in task store"
git push -q -u origin refactor-task-store
echo "✓ branch refactor-task-store pushed"

# ---------------------------------------------------------------- PR 3: config renamed, docs not updated
git checkout -q -b rename-limit-env-var main
sed -i.bak 's/process.env.TASKS_LIMIT ?? 100/process.env.MAX_TASKS ?? 500/' src/store.js
rm -f src/*.bak
git add -A
git commit -q -m "Rename TASKS_LIMIT to MAX_TASKS and raise default to 500"
git push -q -u origin rename-limit-env-var
echo "✓ branch rename-limit-env-var pushed"

git checkout -q main
REMOTE=$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
echo
echo "Now open one pull request per branch (click each link, then 'Create pull request'):"
for b in rename-done-to-completed refactor-task-store rename-limit-env-var; do
  echo "  https://github.com/$REMOTE/compare/main...$b?expand=1"
done
