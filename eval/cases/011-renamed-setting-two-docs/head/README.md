# Task API

A small JSON API for managing a to-do list. It keeps tasks in memory, so it is
meant for demos and tests, not production.

## Quick start

```bash
npm install
DB_URL=postgres://localhost/tasks npm start
```

## Tasks

Each task looks like this:

```json
{ "id": 1, "title": "Buy milk", "done": false }
```

See [docs/api.md](docs/api.md) for every endpoint and
[docs/configuration.md](docs/configuration.md) for settings.

## License

MIT
