# Configuration

The API is configured with environment variables.

| Variable    | Default       | Description                                  |
| ----------- | ------------- | -------------------------------------------- |
| `PORT`      | `3000`        | Port the HTTP server listens on.             |
| `LOG_LEVEL` | `info`        | One of `debug`, `info`, `warn`, `error`.     |
| `DB_URL`    | (required)    | PostgreSQL connection string.                |

Unknown variables are ignored.
