use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::{fmt, io};

use fs_err::tokio::File;
use futures::TryStreamExt;
use glob::{GlobError, PatternError, glob};
use itertools::Itertools;
use reqwest::header::{AUTHORIZATION, InvalidHeaderValue, LOCATION, ToStrError};
use reqwest::multipart::Part;
use reqwest::{Body, Response, StatusCode};
use reqwest_retry::RetryError;
use reqwest_retry::policies::ExponentialBackoff;
use rustc_hash::FxHashMap;
use serde::Deserialize;
use tar_codec::{Archive as _, Member, MemberPayload as _, TarArchive};
use thiserror::Error;
use tokio::io::{AsyncReadExt, BufReader};
use tokio::sync::Semaphore;
use tokio_util::io::ReaderStream;
use tracing::{Level, debug, enabled, trace, warn};
use url::Url;

use uv_auth::{Credentials, Realm};
use uv_cache::{Cache, Refresh};
use uv_client::{
    BaseClient, ClientBuildError, DEFAULT_MAX_REDIRECTS, MetadataFormat, OwnedArchive,
    RegistryClientBuilder, RequestBuilder, RetryParsingError, RetryState,
};
use uv_configuration::{KeyringProviderType, TrustedPublishing};
use uv_distribution_filename::{DistFilename, SourceDistExtension, SourceDistFilename};
use uv_distribution_types::{IndexCapabilities, IndexUrl};
use uv_extract::hash::Hasher;
use uv_fs::{ProgressReader, Simplified};
use uv_metadata::read_metadata_async_seek;
use uv_preview::PreviewFeature;
use uv_pypi_types::{HashAlgorithm, HashDigest, Metadata23, MetadataError};
use uv_redacted::{DisplaySafeUrl, DisplaySafeUrlError};
use uv_warnings::warn_user;

pub use crate::trusted_publishing::TrustedPublishingToken;
use crate::trusted_publishing::pypi::PyPIPublishingService;
use crate::trusted_publishing::{TrustedPublishingError, TrustedPublishingService};

#[derive(Error, Debug)]
pub enum PublishError {
    #[error("The publish path is not a valid glob pattern: `{0}`")]
    Pattern(String, #[source] PatternError),
    /// [`GlobError`] is a wrapped io error.
    #[error(transparent)]
    Glob(#[from] GlobError),
    #[error("Path patterns didn't match any wheels or source distributions")]
    NoFiles,
    #[error(transparent)]
    Fmt(#[from] fmt::Error),
    #[error("File is neither a wheel nor a source distribution: `{}`", _0.user_display())]
    InvalidFilename(PathBuf),
    #[error("Failed to publish: `{}`", _0.user_display())]
    PublishPrepare(PathBuf, #[source] Box<PublishPrepareError>),
    #[error("Failed to publish `{}` to {}", _0.user_display(), _1)]
    PublishSend(
        PathBuf,
        Box<DisplaySafeUrl>,
        #[source] Box<PublishSendError>,
    ),
    #[error("Failed to obtain token for trusted publishing")]
    TrustedPublishing(#[from] Box<TrustedPublishingError>),
    #[error("{0} are not allowed when using trusted publishing")]
    MixedCredentials(String),
    #[error("Failed to query check URL")]
    CheckUrlIndex(#[source] uv_client::Error),
    #[error(transparent)]
    ClientBuild(#[from] ClientBuildError),
    #[error(
        "Local file and index file do not match for {filename}. \
        Local: {hash_algorithm}={local}, Remote: {hash_algorithm}={remote}"
    )]
    HashMismatch {
        filename: Box<DistFilename>,
        hash_algorithm: HashAlgorithm,
        local: String,
        remote: String,
    },
… trimmed for the evaluation dataset …
                )),
                // Hard failure during OIDC discovery or token exchange.
                Err(err) => Ok(TrustedPublishResult::Ignored(err)),
            }
        }
        TrustedPublishing::Always => {
            debug!("Using trusted publishing for GitHub Actions");

            let mut conflicts = Vec::new();
            if username.is_some() {
                conflicts.push("a username");
            }
            if password.is_some() {
                conflicts.push("a password");
            }
            if keyring_provider != KeyringProviderType::Disabled {
                conflicts.push("the keyring");
            }
            if !conflicts.is_empty() {
                return Err(PublishError::MixedCredentials(conflicts.join(" and ")));
            }

            // Attempt to get a token for trusted publishing.
            let token = PyPIPublishingService::new(registry, client)
                .get_token()
                .await
                .map_err(Box::new)?;

            let Some(token) = token else {
                return Err(PublishError::TrustedPublishing(
                    TrustedPublishingError::NoToken.into(),
                ));
            };

            Ok(TrustedPublishResult::Configured(token))
        }
        TrustedPublishing::Never => Ok(TrustedPublishResult::Skipped),
    }
}

/// Request revocation of a token obtained through trusted publishing.
///
/// A successful request does not guarantee that the token was revoked.
pub async fn burn_trusted_publishing_token(
    token: &TrustedPublishingToken,
    registry: &DisplaySafeUrl,
    client: &BaseClient,
) -> Result<(), TrustedPublishingError> {
    PyPIPublishingService::new(registry, client)
        .burn_token(token)
        .await
}

/// Upload a file to a registry.
///
/// Returns `true` if the file was newly uploaded and `false` if it already existed.
///
/// Implements a custom retry flow since the request isn't cloneable.
pub async fn upload(
    group: &UploadDistribution,
    form_metadata: &FormMetadata,
    registry: &DisplaySafeUrl,
    client: &BaseClient,
    retry_policy: ExponentialBackoff,
    credentials: &Credentials,
    check_url_client: Option<&CheckUrlClient<'_>>,
    download_concurrency: &Semaphore,
    reporter: Arc<impl Reporter>,
) -> Result<bool, PublishError> {
    let mut n_past_redirections = 0;
    let max_redirects = DEFAULT_MAX_REDIRECTS;
    let mut current_registry = registry.clone();
    let mut retry_state = RetryState::start(retry_policy, registry.clone());

    loop {
        let (request, idx) = build_upload_request(
            group,
            &current_registry,
            client,
            credentials,
            form_metadata,
            reporter.clone(),
        )
        .await
        .map_err(|err| PublishError::PublishPrepare(group.file.clone(), Box::new(err)))?;

        let result = request.send().await;
        let response = match result {
            Ok(response) => {
                // When the user accidentally uses https://test.pypi.org/legacy (no slash) as publish URL, we
                // get a redirect to https://test.pypi.org/legacy/ (the canonical index URL).
                // In the above case we get 308, where reqwest or `RedirectClientWithMiddleware` would try
                // cloning the streaming body, which is not possible.
