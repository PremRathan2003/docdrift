import urllib.request


def fetch(url, timeout=10):
    """Downloads url and returns the body as text."""
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read().decode()
