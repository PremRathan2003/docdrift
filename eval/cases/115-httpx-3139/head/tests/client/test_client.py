    # Once we're closed we cannot reopen the client.
    with pytest.raises(RuntimeError):
        with client:
            pass  # pragma: no cover


def test_client_closed_state_using_with_block():
    with httpx.Client(transport=httpx.MockTransport(hello_world)) as client:
        assert not client.is_closed
        client.get("http://example.com")

    assert client.is_closed
    with pytest.raises(RuntimeError):
        client.get("http://example.com")


def echo_raw_headers(request: httpx.Request) -> httpx.Response:
    data = [
        (name.decode("ascii"), value.decode("ascii"))
        for name, value in request.headers.raw
    ]
    return httpx.Response(200, json=data)


def test_raw_client_header():
    """
    Set a header in the Client.
    """
    url = "http://example.org/echo_headers"
    headers = {"Example-Header": "example-value"}

    client = httpx.Client(
        transport=httpx.MockTransport(echo_raw_headers), headers=headers
    )
    response = client.get(url)

    assert response.status_code == 200
    assert response.json() == [
        ["Host", "example.org"],
        ["Accept", "*/*"],
        ["Accept-Encoding", "gzip, deflate, br, zstd"],
        ["Connection", "keep-alive"],
        ["User-Agent", f"python-httpx/{httpx.__version__}"],
        ["Example-Header", "example-value"],
    ]


def unmounted(request: httpx.Request) -> httpx.Response:
    data = {"app": "unmounted"}
    return httpx.Response(200, json=data)


def mounted(request: httpx.Request) -> httpx.Response:
    data = {"app": "mounted"}
    return httpx.Response(200, json=data)


def test_mounted_transport():
    transport = httpx.MockTransport(unmounted)
    mounts = {"custom://": httpx.MockTransport(mounted)}

    client = httpx.Client(transport=transport, mounts=mounts)

    response = client.get("https://www.example.com")
    assert response.status_code == 200
    assert response.json() == {"app": "unmounted"}

    response = client.get("custom://www.example.com")
    assert response.status_code == 200
    assert response.json() == {"app": "mounted"}


def test_all_mounted_transport():
    mounts = {"all://": httpx.MockTransport(mounted)}

    client = httpx.Client(mounts=mounts)

    response = client.get("https://www.example.com")
    assert response.status_code == 200
    assert response.json() == {"app": "mounted"}

