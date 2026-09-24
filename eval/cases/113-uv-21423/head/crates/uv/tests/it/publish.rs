use assert_cmd::assert::OutputAssertExt;
use assert_fs::fixture::{FileTouch, FileWriteStr, PathChild};
use fs_err::OpenOptions;
use indoc::{formatdoc, indoc};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::env::current_dir;
use std::io::Write;
use std::path::{Path, PathBuf};
use uv_static::EnvVars;
use uv_test::{uv_snapshot, venv_bin_path};
use wiremock::matchers::{basic_auth, body_json, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn test_link(filename: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("test/links")
        .join(filename)
}

fn dummy_wheel() -> PathBuf {
    test_link("ok-1.0.0-py3-none-any.whl")
}

fn basic_app_wheel() -> PathBuf {
    test_link("basic_app-0.1.0-py3-none-any.whl")
}

fn basic_package_sdist() -> PathBuf {
    test_link("basic_package-0.1.0.tar.gz")
}

fn basic_package_wheel() -> PathBuf {
    test_link("basic_package-0.1.0-py3-none-any.whl")
}

#[test]
fn username_password_no_longer_supported() {
    let context = uv_test::test_context!("3.12").with_filtered_sizes();

    uv_snapshot!(context.filters(), context.publish()
        .arg("-u")
        .arg("dummy")
        .arg("-p")
        .arg("dummy")
        .arg("--publish-url")
        .arg("https://test.pypi.org/legacy/")
        .arg(dummy_wheel()), @"
… trimmed for the evaluation dataset …
                .insert_header("Location", format!("{}/simple/ok/", pypi_server.uri()))
                .set_body_raw("Redirecting", "text/plain"),
        )
        .expect(1)
        .mount(&gitlab_server)
        .await;
    Mock::given(method("GET"))
        .and(path("/simple/ok/"))
        .respond_with(
            ResponseTemplate::new(404).set_body_raw("Not found", "text/plain; charset=UTF-8"),
        )
        .expect(1)
        .mount(&pypi_server)
        .await;
    Mock::given(method("POST"))
        .and(path("/upload"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&gitlab_server)
        .await;

    uv_snapshot!(context.filters(), context.publish()
        .arg("-u")
        .arg("dummy")
        .arg("-p")
        .arg("dummy")
        .arg("--check-url")
        .arg(format!("{}/simple/", gitlab_server.uri()))
        .arg("--publish-url")
        .arg(format!("{}/upload", gitlab_server.uri()))
        .arg(dummy_wheel()), @"
    exit_code: 0 (success)
    ----- stderr -----
    Publishing 1 file to http://[LOCALHOST]/upload
    Hashing ok-1.0.0-py3-none-any.whl ([SIZE]B)
    Uploading ok-1.0.0-py3-none-any.whl ([SIZE]B)
    "
    );
}

/// Native GitLab CI trusted publishing using `PYPI_ID_TOKEN` revokes the token after all uploads.
#[tokio::test]
async fn gitlab_trusted_publishing_pypi_id_token() {
    let context = uv_test::test_context!("3.12").with_filtered_sizes();

    let server = MockServer::start().await;

    // Audience endpoint (PyPI)
    Mock::given(method("GET"))
        .and(path("/_/oidc/audience"))
        .respond_with(
            ResponseTemplate::new(200).set_body_raw("{\"audience\":\"pypi\"}", "application/json"),
        )
        .mount(&server)
        .await;

    // Mint token endpoint returns a short-lived API token
    Mock::given(method("POST"))
        .and(path("/_/oidc/mint-token"))
        .respond_with(
            ResponseTemplate::new(200).set_body_raw("{\"token\":\"apitoken\"}", "application/json"),
        )
        .mount(&server)
        .await;

    // Upload endpoint requires the minted token as Basic auth
    Mock::given(method("POST"))
        .and(path("/upload"))
        .and(basic_auth("__token__", "apitoken"))
        .respond_with(ResponseTemplate::new(200))
        .expect(2)
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/_/oidc/burn-token"))
        .and(body_json(json!({ "token": "apitoken" })))
        .respond_with(ResponseTemplate::new(202))
        .expect(1)
        .mount(&server)
        .await;

    // Trusted publishing is detected automatically without an explicit flag.
    uv_snapshot!(context.filters(), context.publish()
        .arg("--publish-url")
        .arg(format!("{}/upload", server.uri()))
        .arg(dummy_wheel())
        .arg(basic_app_wheel())
        .env(EnvVars::GITLAB_CI, "true")
        .env(EnvVars::PYPI_ID_TOKEN, "gitlab-oidc-jwt"), @"
    exit_code: 0 (success)
    ----- stderr -----
    Publishing 2 files to http://[LOCALHOST]/upload
    Hashing basic_app-0.1.0-py3-none-any.whl ([SIZE]KiB)
    Uploading basic_app-0.1.0-py3-none-any.whl ([SIZE]KiB)
    Hashing ok-1.0.0-py3-none-any.whl ([SIZE]B)
    Uploading ok-1.0.0-py3-none-any.whl ([SIZE]B)
    "
    );

    let requests = server
        .received_requests()
        .await
        .expect("Request recording is enabled");
    insta::assert_debug_snapshot!(
        requests.iter().map(|request| request.url.path()).collect::<Vec<_>>(),
        @r#"
    [
        "/_/oidc/audience",
        "/_/oidc/mint-token",
        "/upload",
        "/upload",
        "/_/oidc/burn-token",
    ]
    "#
    );
}

/// Native GitLab CI trusted publishing using `TESTPYPI_ID_TOKEN`
#[tokio::test]
async fn gitlab_trusted_publishing_testpypi_id_token() {
    let context = uv_test::test_context!("3.12").with_filtered_sizes();

    let server = MockServer::start().await;

    // Audience endpoint (TestPyPI)
    Mock::given(method("GET"))
        .and(path("/_/oidc/audience"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_raw("{\"audience\":\"testpypi\"}", "application/json"),
        )
        .mount(&server)
        .await;

    // Mint token endpoint returns a short-lived API token
    Mock::given(method("POST"))
        .and(path("/_/oidc/mint-token"))
        .respond_with(
            ResponseTemplate::new(200).set_body_raw("{\"token\":\"apitoken\"}", "application/json"),
        )
        .mount(&server)
        .await;

    // Upload endpoint requires the minted token as Basic auth
    Mock::given(method("POST"))
        .and(path("/upload"))
        .and(basic_auth("__token__", "apitoken"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/_/oidc/burn-token"))
        .and(body_json(json!({ "token": "apitoken" })))
        .respond_with(ResponseTemplate::new(202))
        .expect(1)
        .mount(&server)
        .await;

    uv_snapshot!(context.filters(), context.publish()
        .arg("--trusted-publishing")
        .arg("always")
        .arg("--publish-url")
        .arg(format!("{}/upload", server.uri()))
        .arg(dummy_wheel())
        // Emulate GitLab CI with TESTPYPI_ID_TOKEN present
        .env(EnvVars::GITLAB_CI, "true")
        .env(EnvVars::TESTPYPI_ID_TOKEN, "gitlab-oidc-jwt"), @"
    exit_code: 0 (success)
    ----- stderr -----
    Publishing 1 file to http://[LOCALHOST]/upload
    Hashing ok-1.0.0-py3-none-any.whl ([SIZE]B)
    Uploading ok-1.0.0-py3-none-any.whl ([SIZE]B)
    "
    );
}

/// Failure to revoke a token must not change the outcome of publishing.
#[tokio::test]
async fn trusted_publishing_burn_failure() {
    let context = uv_test::test_context!("3.12").with_filtered_sizes();
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/_/oidc/audience"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "audience": "pypi" })))
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/_/oidc/mint-token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "token": "apitoken" })))
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/_/oidc/burn-token"))
        .and(body_json(json!({ "token": "apitoken" })))
        // An index implementing the minting API may not support token revocation yet.
        // Response bodies must not be logged, as they could echo the token.
        .respond_with(ResponseTemplate::new(404).set_body_raw("apitoken", "text/plain"))
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/upload"))
        .and(basic_auth("__token__", "apitoken"))
        .respond_with(ResponseTemplate::new(200))
        .up_to_n_times(1)
        .expect(1)
        .mount(&server)
        .await;

    uv_snapshot!(context.filters(), context.publish()
        .arg("--trusted-publishing")
        .arg("always")
        .arg("--publish-url")
        .arg(format!("{}/upload", server.uri()))
        .arg(dummy_wheel())
        .env(EnvVars::GITLAB_CI, "true")
        .env(EnvVars::PYPI_ID_TOKEN, "gitlab-oidc-jwt"), @"
    exit_code: 0 (success)
    ----- stderr -----
    Publishing 1 file to http://[LOCALHOST]/upload
    Hashing ok-1.0.0-py3-none-any.whl ([SIZE]B)
    Uploading ok-1.0.0-py3-none-any.whl ([SIZE]B)
    warning: Failed to invalidate trusted publishing token. It will expire naturally. Cause: Failed to fetch: `http://[LOCALHOST]/_/oidc/burn-token`
    "
    );

    Mock::given(method("POST"))
        .and(path("/upload"))
        .and(basic_auth("__token__", "apitoken"))
        .respond_with(ResponseTemplate::new(400).set_body_raw("Upload failed", "text/plain"))
        .expect(1)
        .mount(&server)
        .await;

    uv_snapshot!(context.filters(), context.publish()
        .arg("--trusted-publishing")
        .arg("always")
        .arg("--publish-url")
        .arg(format!("{}/upload", server.uri()))
        .arg(dummy_wheel())
        .env(EnvVars::GITLAB_CI, "true")
        .env(EnvVars::PYPI_ID_TOKEN, "gitlab-oidc-jwt"), @"
    exit_code: 2 (failure)
    ----- stderr -----
    Publishing 1 file to http://[LOCALHOST]/upload
    Hashing ok-1.0.0-py3-none-any.whl ([SIZE]B)
    Uploading ok-1.0.0-py3-none-any.whl ([SIZE]B)
    warning: Failed to invalidate trusted publishing token. It will expire naturally. Cause: Failed to fetch: `http://[LOCALHOST]/_/oidc/burn-token`
    error: Failed to publish `[WORKSPACE]/test/links/ok-1.0.0-py3-none-any.whl` to http://[LOCALHOST]/upload
      Caused by: Server returned status code 400 Bad Request. Server says: Upload failed
    "
    );
}

/// A token is revoked even if reading distribution metadata fails before the upload.
#[tokio::test]
async fn trusted_publishing_burn_after_prepare_failure() {
    let context = uv_test::test_context!("3.12").with_filtered_sizes();
    let server = MockServer::start().await;
    let wheel = context.temp_dir.child("a-1.0.0-py3-none-any.whl");
    wheel.touch().expect("Failed to create wheel");

    Mock::given(method("GET"))
        .and(path("/_/oidc/audience"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "audience": "pypi" })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/_/oidc/mint-token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "token": "apitoken" })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/_/oidc/burn-token"))
        .and(body_json(json!({ "token": "apitoken" })))
        .respond_with(ResponseTemplate::new(202))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/upload"))
        .respond_with(ResponseTemplate::new(200))
        .expect(0)
        .mount(&server)
        .await;

    uv_snapshot!(context.filters(), context.publish()
        .arg("--trusted-publishing")
        .arg("always")
        .arg("--publish-url")
        .arg(format!("{}/upload", server.uri()))
        .arg(wheel.path())
        .env(EnvVars::GITLAB_CI, "true")
        .env(EnvVars::PYPI_ID_TOKEN, "gitlab-oidc-jwt"), @"
    exit_code: 2 (failure)
    ----- stderr -----
    Publishing 1 file to http://[LOCALHOST]/upload
    Hashing a-1.0.0-py3-none-any.whl ([SIZE]B)
    error: Failed to publish: `a-1.0.0-py3-none-any.whl`
      Caused by: Failed to read metadata
      Caused by: Failed to read from zip file
      Caused by: unable to locate the end of central directory record
    "
    );
}

/// Explicit credentials are not revoked, even in a trusted publishing environment.
#[tokio::test]
async fn trusted_publishing_does_not_burn_explicit_token() {
    let context = uv_test::test_context!("3.12").with_filtered_sizes();
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/_/oidc/burn-token"))
        .respond_with(ResponseTemplate::new(202))
        .expect(0)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/upload"))
        .and(basic_auth("__token__", "explicit-token"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;

    uv_snapshot!(context.filters(), context.publish()
        .arg("--token")
        .arg("explicit-token")
        .arg("--publish-url")
        .arg(format!("{}/upload", server.uri()))
        .arg(dummy_wheel())
        .env(EnvVars::GITLAB_CI, "true")
        .env(EnvVars::PYPI_ID_TOKEN, "gitlab-oidc-jwt"), @"
    exit_code: 0 (success)
    ----- stderr -----
    Publishing 1 file to http://[LOCALHOST]/upload
    Hashing ok-1.0.0-py3-none-any.whl ([SIZE]B)
    Uploading ok-1.0.0-py3-none-any.whl ([SIZE]B)
    "
    );
}

/// PyPI returns `application/json` errors with a `code` field.
#[tokio::test]
async fn upload_error_pypi_json() {
    let context = uv_test::test_context!("3.12").with_filtered_sizes();
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/upload"))
        .respond_with(ResponseTemplate::new(400).set_body_raw(
            r#"{"message": "Error", "code": "400 Use 'source' as Python version for an sdist.", "title": "Bad Request"}"#,
            "application/json",
        ))
        .mount(&server)
        .await;

    uv_snapshot!(context.filters(), context.publish()
        .arg("-u")
        .arg("dummy")
        .arg("-p")
        .arg("dummy")
        .arg("--publish-url")
        .arg(format!("{}/upload", server.uri()))
        .arg(dummy_wheel()), @"
    exit_code: 2 (failure)
    ----- stderr -----
    Publishing 1 file to http://[LOCALHOST]/upload
    Hashing ok-1.0.0-py3-none-any.whl ([SIZE]B)
    Uploading ok-1.0.0-py3-none-any.whl ([SIZE]B)
    error: Failed to publish `[WORKSPACE]/test/links/ok-1.0.0-py3-none-any.whl` to http://[LOCALHOST]/upload
      Caused by: Server returned status code 400 Bad Request. Server says: 400 Use 'source' as Python version for an sdist.
    "
    );
}

/// Handle `application/problem+json` errors with RFC 9457 Problem Details.
#[tokio::test]
async fn upload_error_problem_details() {
    let context = uv_test::test_context!("3.12").with_filtered_sizes();
    let server = MockServer::start().await;

