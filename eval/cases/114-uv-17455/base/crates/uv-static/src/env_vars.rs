//! Environment variables used or supported by uv.
//! Used to generate `docs/reference/environment.md`.
use uv_macros::{attr_added_in, attr_env_var_pattern, attr_hidden, attribute_env_vars_metadata};

/// Declares all environment variable used throughout `uv` and its crates.
pub struct EnvVars;

#[attribute_env_vars_metadata]
impl EnvVars {
    /// The path to the binary that was used to invoke uv.
    ///
    /// This is propagated to all subprocesses spawned by uv.
    ///
    /// If the executable was invoked through a symbolic link, some platforms will return the path
    /// of the symbolic link and other platforms will return the path of the symbolic link’s target.
    ///
    /// See <https://doc.rust-lang.org/std/env/fn.current_exe.html#security> for security
    /// considerations.
    #[attr_added_in("0.6.0")]
    pub const UV: &'static str = "UV";

    /// The path to the Ruff binary used by `uv format`.
    #[attr_added_in("0.11.22")]
    pub const RUFF: &'static str = "RUFF";

    /// The path to the ty binary used by `uv check`.
    #[attr_added_in("0.11.22")]
    pub const TY: &'static str = "TY";

    /// Equivalent to the `--offline` command-line argument. If set, uv will disable network access.
    #[attr_added_in("0.5.9")]
    pub const UV_OFFLINE: &'static str = "UV_OFFLINE";

    /// Equivalent to the `--default-index` command-line argument. If set, uv will use
    /// this URL as the default index when searching for packages.
    #[attr_added_in("0.4.23")]
    pub const UV_DEFAULT_INDEX: &'static str = "UV_DEFAULT_INDEX";

    /// Equivalent to the `--index` command-line argument. If set, uv will use this
    /// space-separated list of URLs as additional indexes when searching for packages.
    #[attr_added_in("0.4.23")]
    pub const UV_INDEX: &'static str = "UV_INDEX";

    /// Equivalent to the `--index-url` command-line argument. If set, uv will use this
    /// URL as the default index when searching for packages.
    /// (Deprecated: use `UV_DEFAULT_INDEX` instead.)
    #[attr_added_in("0.0.5")]
    pub const UV_INDEX_URL: &'static str = "UV_INDEX_URL";

    /// Equivalent to the `--extra-index-url` command-line argument. If set, uv will
    /// use this space-separated list of URLs as additional indexes when searching for packages.
    /// (Deprecated: use `UV_INDEX` instead.)
    #[attr_added_in("0.1.3")]
    pub const UV_EXTRA_INDEX_URL: &'static str = "UV_EXTRA_INDEX_URL";

    /// Equivalent to the `--find-links` command-line argument. If set, uv will use this
    /// comma-separated list of additional locations to search for packages.
    #[attr_added_in("0.4.19")]
    pub const UV_FIND_LINKS: &'static str = "UV_FIND_LINKS";

    /// Equivalent to the `--no-sources` command-line argument. If set, uv will ignore
    /// `[tool.uv.sources]` annotations when resolving dependencies.
    #[attr_added_in("0.9.8")]
    pub const UV_NO_SOURCES: &'static str = "UV_NO_SOURCES";

    /// Equivalent to the `--cache-dir` command-line argument. If set, uv will use this
    /// directory for caching instead of the default cache directory.
    #[attr_added_in("0.0.5")]
    pub const UV_CACHE_DIR: &'static str = "UV_CACHE_DIR";

    /// The directory for storage of credentials when using a plain text backend.
    #[attr_added_in("0.8.15")]
    pub const UV_CREDENTIALS_DIR: &'static str = "UV_CREDENTIALS_DIR";

    /// Equivalent to the `--no-cache` command-line argument. If set, uv will not use the
    /// cache for any operations.
    #[attr_added_in("0.1.2")]
    pub const UV_NO_CACHE: &'static str = "UV_NO_CACHE";

    /// Equivalent to the `--resolution` command-line argument. For example, if set to
