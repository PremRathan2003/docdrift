use std::ffi::OsString;
use std::fmt::{self, Display, Formatter};
use std::ops::{Deref, DerefMut};
use std::path::PathBuf;
use std::str::FromStr;

use anyhow::{Result, anyhow};
use clap::builder::styling::{AnsiColor, Effects, Style};
use clap::builder::{PossibleValue, Styles, TypedValueParser, ValueParserFactory};
use clap::error::ErrorKind;
use clap::{Args, Parser, Subcommand};
use clap::{ValueEnum, ValueHint};

use uv_audit::VulnerabilityServiceFormat;
use uv_auth::Service;
use uv_cache::CacheArgs;
use uv_configuration::{
    ExportFormat, IndexStrategy, KeyringProviderType, PackageNameSpecifier, PipCompileFormat,
    ProjectBuildBackend, TargetTriple, TrustedHost, TrustedPublishing, VersionControlSystem,
};
use uv_distribution_types::{
    ConfigSettingEntry, ConfigSettingPackageEntry, Index, IndexUrl, Origin, PipExtraIndex,
    PipFindLinks, PipIndex,
};
use uv_normalize::{ExtraName, GroupName, PackageName, PipGroupName};
use uv_pep508::{MarkerTree, Requirement};
use uv_preview::MaybePreviewFeature;
use uv_pypi_types::VerbatimParsedUrl;
use uv_python::{PythonDownloads, PythonPreference, PythonVersion};
use uv_redacted::DisplaySafeUrl;
use uv_resolver::{
    AnnotationStyle, ExcludeNewerOverride, ExcludeNewerPackageEntry, ForkStrategy, PrereleaseMode,
    PrereleasePackageEntry, ResolutionMode,
};
use uv_settings::PythonInstallMirrors;
use uv_static::EnvVars;
use uv_torch::TorchMode;
use uv_workspace::pyproject_mut::AddBoundsKind;

pub mod comma;
pub mod compat;
pub mod options;
pub mod version;

#[derive(Debug, Clone, Copy, clap::ValueEnum)]
pub enum VersionFormat {
    /// Display the version as plain text.
    Text,
    /// Display the version as JSON.
    Json,
}

#[derive(Debug, Default, Clone, Copy, clap::ValueEnum)]
pub enum PythonListFormat {
    /// Plain text (for humans).
    #[default]
    Text,
    /// JSON (for computers).
    Json,
}

#[derive(Debug, Default, Clone, Copy, clap::ValueEnum)]
pub enum SyncFormat {
    /// Display the result in a human-readable format.
    #[default]
    Text,
    /// Display the result in JSON format.
    Json,
}

#[derive(Debug, Default, Clone, Copy, clap::ValueEnum)]
pub enum AuditOutputFormat {
    /// Display the result in a human-readable format.
    #[default]
    Text,
    /// Display the result in JSON format.
    Json,
… trimmed for the evaluation dataset …
            .map(PipIndex::from)
            .map(Maybe::Some)
            .map_err(|err| err.to_string())
    }
}

/// Parse an `--extra-index-url` argument into an [`PipExtraIndex`], mapping the empty string to `None`.
fn parse_extra_index_url(input: &str) -> Result<Maybe<PipExtraIndex>, String> {
    if input.is_empty() {
        Ok(Maybe::None)
    } else {
        IndexUrl::from_str(input)
            .map(Index::from_extra_index_url)
            .map(|index| Index {
                origin: Some(Origin::Cli),
                ..index
            })
            .map(PipExtraIndex::from)
            .map(Maybe::Some)
            .map_err(|err| err.to_string())
    }
}

/// Parse a `--find-links` argument into an [`PipFindLinks`], mapping the empty string to `None`.
fn parse_find_links(input: &str) -> Result<Maybe<PipFindLinks>, String> {
    if input.is_empty() {
        Ok(Maybe::None)
    } else {
        IndexUrl::from_str(input)
            .map(Index::from_find_links)
            .map(|index| Index {
                origin: Some(Origin::Cli),
                ..index
            })
            .map(PipFindLinks::from)
            .map(Maybe::Some)
            .map_err(|err| err.to_string())
    }
}

/// Parse an `--index` argument into a [`Vec<Index>`], mapping the empty string to an empty Vec.
///
/// This function splits the input on all whitespace characters rather than a single delimiter,
/// which is necessary to parse environment variables like `PIP_EXTRA_INDEX_URL`.
/// The standard `clap::Args` `value_delimiter` only supports single-character delimiters.
fn parse_indices(input: &str) -> Result<Vec<Maybe<Index>>, String> {
    if input.trim().is_empty() {
        return Ok(Vec::new());
    }
    let mut indices = Vec::new();
    for token in input.split_whitespace() {
        match Index::from_str(token) {
            Ok(index) => indices.push(Maybe::Some(Index {
                default: false,
                origin: Some(Origin::Cli),
                ..index
            })),
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(indices)
}

/// Parse a `--default-index` argument into an [`Index`], mapping the empty string to `None`.
fn parse_default_index(input: &str) -> Result<Maybe<Index>, String> {
    if input.is_empty() {
        Ok(Maybe::None)
    } else {
        match Index::from_str(input) {
            Ok(index) => Ok(Maybe::Some(Index {
                default: true,
                origin: Some(Origin::Cli),
                ..index
            })),
            Err(err) => Err(err.to_string()),
        }
    }
}

/// Parse a string into an [`Url`], mapping the empty string to `None`.
fn parse_insecure_host(input: &str) -> Result<Maybe<TrustedHost>, String> {
    if input.is_empty() {
        Ok(Maybe::None)
    } else {
        match TrustedHost::from_str(input) {
            Ok(host) => Ok(Maybe::Some(host)),
            Err(err) => Err(err.to_string()),
        }
    }
}

/// Parse a string into a [`PathBuf`]. The string can represent a file, either as a path or a
/// `file://` URL.
fn parse_file_path(input: &str) -> Result<PathBuf, String> {
    if input.starts_with("file://") {
        let url = match url::Url::from_str(input) {
            Ok(url) => url,
            Err(err) => return Err(err.to_string()),
        };
        url.to_file_path()
            .map_err(|()| "invalid file URL".to_string())
    } else {
        Ok(PathBuf::from(input))
    }
}

/// Parse a string into a [`PathBuf`], mapping the empty string to `None`.
fn parse_maybe_file_path(input: &str) -> Result<Maybe<PathBuf>, String> {
    if input.is_empty() {
        Ok(Maybe::None)
    } else {
        parse_file_path(input).map(Maybe::Some)
    }
}
… trimmed for the evaluation dataset …
#[derive(Args)]
pub struct GenerateShellCompletionArgs {
    /// The shell to generate the completion script for
    pub shell: clap_complete_command::Shell,

    // Hide unused global options.
    #[arg(long, short, hide = true)]
    pub no_cache: bool,
    #[arg(long, hide = true)]
    pub cache_dir: Option<PathBuf>,

    #[arg(long, hide = true)]
    pub python_preference: Option<PythonPreference>,
    #[arg(long, hide = true)]
    pub no_python_downloads: bool,

    #[arg(long, short, action = clap::ArgAction::Count, conflicts_with = "verbose", hide = true)]
    pub quiet: u8,
    #[arg(long, short, action = clap::ArgAction::Count, conflicts_with = "quiet", hide = true)]
    pub verbose: u8,
    #[arg(long, conflicts_with = "no_color", hide = true)]
    pub color: Option<ColorChoice>,
    #[arg(long, hide = true)]
    pub native_tls: bool,
    #[arg(long, hide = true)]
    pub offline: bool,
    #[arg(long, hide = true)]
    pub no_progress: bool,
    #[arg(long, hide = true)]
    pub config_file: Option<PathBuf>,
    #[arg(long, hide = true)]
    pub no_config: bool,
    #[arg(long, short, action = clap::ArgAction::HelpShort, hide = true)]
    pub help: Option<bool>,
    #[arg(short = 'V', long, hide = true)]
    pub version: bool,
}

#[derive(Args)]
pub struct IndexArgs {
    /// The URLs to use when resolving dependencies, in addition to the default index.
    ///
    /// Accepts either a repository compliant with PEP 503 (the simple repository API), or a local
    /// directory laid out in the same format.
    ///
    /// All indexes provided via this flag take priority over the index specified by
    /// `--default-index` (which defaults to PyPI). When multiple `--index` flags are provided,
    /// earlier values take priority.
    ///
    /// Index names are not supported as values. Relative paths must be disambiguated from index
    /// names with `./` or `../` on Unix or `.\\`, `..\\`, `./` or `../` on Windows.
    //
    // The nested Vec structure (`Vec<Vec<Maybe<Index>>>`) is required for clap's
    // value parsing mechanism, which processes one value at a time, in order to handle
    // `UV_INDEX` the same way pip handles `PIP_EXTRA_INDEX_URL`.
    #[arg(
        long,
        env = EnvVars::UV_INDEX,
        hide_env_values = true,
        value_parser = parse_indices,
        help_heading = "Index options"
    )]
    pub index: Option<Vec<Vec<Maybe<Index>>>>,

    /// The URL of the default package index (by default: <https://pypi.org/simple>).
    ///
    /// Accepts either a repository compliant with PEP 503 (the simple repository API), or a local
    /// directory laid out in the same format.
    ///
    /// The index given by this flag is given lower priority than all other indexes specified via
    /// the `--index` flag.
    #[arg(
        long,
        env = EnvVars::UV_DEFAULT_INDEX,
        hide_env_values = true,
        value_parser = parse_default_index,
        help_heading = "Index options"
    )]
    pub default_index: Option<Maybe<Index>>,

    /// (Deprecated: use `--default-index` instead) The URL of the Python package index (by default:
    /// <https://pypi.org/simple>).
    ///
    /// Accepts either a repository compliant with PEP 503 (the simple repository API), or a local
    /// directory laid out in the same format.
    ///
    /// The index given by this flag is given lower priority than all other indexes specified via
    /// the `--extra-index-url` flag.
    #[arg(
        long,
        short,
        env = EnvVars::UV_INDEX_URL,
        hide_env_values = true,
        value_parser = parse_index_url,
        help_heading = "Index options"
    )]
    pub index_url: Option<Maybe<PipIndex>>,

    /// (Deprecated: use `--index` instead) Extra URLs of package indexes to use, in addition to
    /// `--index-url`.
    ///
    /// Accepts either a repository compliant with PEP 503 (the simple repository API), or a local
    /// directory laid out in the same format.
    ///
    /// All indexes provided via this flag take priority over the index specified by `--index-url`
    /// (which defaults to PyPI). When multiple `--extra-index-url` flags are provided, earlier
    /// values take priority.
    #[arg(
        long,
        env = EnvVars::UV_EXTRA_INDEX_URL,
        hide_env_values = true,
        value_delimiter = ' ',
        value_parser = parse_extra_index_url,
        help_heading = "Index options"
    )]
    pub extra_index_url: Option<Vec<Maybe<PipExtraIndex>>>,

    /// Locations to search for candidate distributions, in addition to those found in the registry
    /// indexes.
