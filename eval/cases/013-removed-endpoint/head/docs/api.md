# API reference

All endpoints accept and return JSON.

## Authentication

Send your key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: YOUR_KEY" https://api.example.com/tasks
```

Requests are limited to 100 requests per minute per key. Over the limit, the
API answers `429 Too Many Requests`.

## Tasks

### `GET /tasks`

Returns tasks, oldest first.

Query parameters:

- `limit` (default 20, max 100): how many tasks to return.
- `offset` (default 0): how many tasks to skip.

### `POST /tasks`

Creates a task. Body: `{ "title": "Buy milk" }`. Returns `200 OK` with the
created task.

### `DELETE /tasks/:id`

Deletes a task. Returns `204 No Content`.
