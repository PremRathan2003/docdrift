import urllib.request


def fetch(url, timeout_seconds=10):
    """Downloads url and returns the body as text."""
    with urllib.request.urlopen(url, timeout=timeout_seconds) as response:
        return response.read().decode()
