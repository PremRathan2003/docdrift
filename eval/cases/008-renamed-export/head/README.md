# tiny-dates

Two small helpers for ISO dates, with no dependencies.

```ts
import { formatDate, parseDate } from 'tiny-dates';

const d = parseDate('2026-09-22');
formatDate(d); // '2026-09-22'
```

`parseDate` throws a `RangeError` for anything that isn't `YYYY-MM-DD`.
