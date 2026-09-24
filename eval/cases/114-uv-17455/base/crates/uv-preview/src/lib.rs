    /// takes effect before configuration is loaded.
    ProjectDirectoryMustExist,
    /// Allows setting `exclude-newer` on configured package indexes.
    IndexExcludeNewer,
    /// Allows signing requests to Azure Blob Storage endpoints with Azure credentials.
    AzureEndpoint,
    /// Rewrites `pyproject.toml` as TOML 1.0 when building source distributions, preserving the
    /// original as `pyproject.toml.orig` to ensure compatibility with older build tools.
    TomlBackwardsCompatibility,
    /// Allows `uv sync` and other commands to check for malware using [OSV](https://osv.dev) before
    /// installing packages.
    MalwareCheck,
    /// Prevents `uv venv --clear` from clearing a directory that does not contain a `pyvenv.cfg` file
    /// unless `--force` is provided.
    VenvSafeClear,
    /// Allows using `uv check`.
    #[preview(alias = "check")]
    CheckCommand,
    /// Makes `uv init` create a packaged application with a `src/` layout, build system, and script
    /// entry point by default.
    PackagedInit,
    /// Stores [project virtual environments](./projects/layout.md#centralized-project-environments)
    /// in the uv cache.
    CentralizedProjectEnvs,
    /// Stores a `uv.lock` alongside each installed tool and reuses it for reproducible installations,
    /// upgrades, and audits.
    ToolInstallLocks,
    /// Allows using `uv workspace list --scripts`.
    WorkspaceListScripts,
    /// Stops installing the `_virtualenv.py` / `_virtualenv.pth` distutils configuration monkeypatch
    /// in virtual environments for Python 3.10 and later.
    NoDistutilsPatch,
    /// Allows requiring a hash algorithm for configured package indexes.
    IndexHashAlgorithm,
    /// Rejects non-canonical lockfile formatting when using `--locked` or `--check`.
    LockfileFormatCheck,
    /// Omit `package.metadata` from `uv.lock`.
    LockWithoutMetadata,
    /// Uses the new `tar-codec` encoding/decoding backend, instead of `astral-tokio-tar`.
    TarCodec,
}

impl Display for PreviewFeature {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Error, Clone)]
#[error("Unknown feature flag")]
pub struct PreviewFeatureParseError;

impl FromStr for PreviewFeature {
    type Err = PreviewFeatureParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::metadata()
            .iter()
            .find(|(feature, _, aliases)| feature.as_str() == s || aliases.contains(&s))
            .map(|(feature, _, _)| *feature)
            .ok_or(PreviewFeatureParseError)
    }
}

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
#[error("preview feature name cannot be empty")]
pub struct EmptyPreviewFeatureNameError;

/// A user-provided preview feature name, which may refer to an unknown feature.
#[derive(Debug, Clone)]
pub enum MaybePreviewFeature {
    Known(PreviewFeature),
    Unknown(String),
}

impl FromStr for MaybePreviewFeature {
    type Err = EmptyPreviewFeatureNameError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let s = s.trim();
