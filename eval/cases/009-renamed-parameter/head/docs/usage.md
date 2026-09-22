# Usage

```python
from quickget import fetch

html = fetch("https://example.com", timeout=5)
```

`fetch` raises `urllib.error.URLError` when the server can't be reached.
