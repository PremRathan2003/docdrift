use std::process::Command;

use assert_fs::prelude::*;
use url::Url;
use uv_static::EnvVars;

use uv_test::{capture_uv_snapshot, diff_uv_snapshot, uv_snapshot};

/// Add shared arguments to a command.
///
/// In particular, remove any user-defined environment variables and set any machine-specific
/// environment variables to static values.
fn add_shared_args(mut command: Command) -> Command {
    command
        .env(EnvVars::UV_LINK_MODE, "clone")
        .env(EnvVars::UV_CONCURRENT_DOWNLOADS, "50")
        .env(EnvVars::UV_CONCURRENT_BUILDS, "16")
        .env(EnvVars::UV_CONCURRENT_INSTALLS, "8")
        .env(EnvVars::UV_CONCURRENT_CACHE_READS, "2")
        .env_remove(EnvVars::UV_EXCLUDE_NEWER)
        .env_remove(EnvVars::UV_PYTHON_DOWNLOADS);

    if cfg!(unix) {
        // Avoid locale issues in tests
        command.env(EnvVars::LC_ALL, "C");
    }
    command
}

#[test]
#[cfg_attr(
    windows,
    ignore = "Configuration tests are not yet supported on Windows"
)]
fn pip_compile_baseline() {
    let context = uv_test::test_context!("3.12");

    capture_uv_snapshot!(context.filters(), add_shared_args(context.pip_compile())
        .arg("--show-settings")
        .arg("requirements.in"), @r#"
    exit_code: 0 (success)
    ----- stdout -----
    GlobalSettings {
        required_version: None,
        quiet: 0,
        verbose: 0,
        color: Auto,
… trimmed for the evaluation dataset …

    let config = context.temp_dir.child("uv.toml");
    config.write_str(indoc::indoc! {r#"
        [[index]]
        url = "https://file.pypi.org/simple"
        default = true
    "#})?;

    // Prefer the `--index-url` from the CLI, and treat it as the default.
    // Compare against output with legacy `index-url` in the config and `--default-index` on the CLI.
    let index_url = diff_uv_snapshot!(context.filters(), &default_index, add_shared_args(context.pip_compile())
        .arg("requirements.in")
        .arg("--show-settings")
        .arg("--index-url")
        .arg("https://cli.pypi.org/simple"), @""
    );

    // Prefer the `--extra-index-url` from the CLI, but not as the default.
    // Compare against output of the same command with `--index-url` instead of `--extra-index-url`.
    diff_uv_snapshot!(context.filters(), &index_url, add_shared_args(context.pip_compile())
        .arg("requirements.in")
        .arg("--show-settings")
        .arg("--extra-index-url")
        .arg("https://cli.pypi.org/simple"), @"
    ...
                             },
                         ),
                         explicit: false,
    -                    default: true,
    +                    default: false,
                         origin: Some(
                             Cli,
                         ),
    ...
    "
    );

    Ok(())
}

/// Verify hashes by default.
#[test]
#[cfg_attr(
    windows,
    ignore = "Configuration tests are not yet supported on Windows"
)]
fn verify_hashes() -> anyhow::Result<()> {
    let context = uv_test::test_context!("3.12");

    let baseline = capture_uv_snapshot!(
        context.filters(),
        add_shared_args(context.pip_install())
            .arg("--show-settings")
            .arg("-r")
            .arg("requirements.in")
    );

    let requirements_in = context.temp_dir.child("requirements.in");
    requirements_in.write_str("anyio>3.0.0")?;

    let default = diff_uv_snapshot!(context.filters(), &baseline, add_shared_args(context.pip_install())
        .arg("-r")
        .arg("requirements.in")
        .arg("--show-settings"), @"");

    // Compare against output of the same command without `--no-verify-hashes`.
    diff_uv_snapshot!(context.filters(), &default, add_shared_args(context.pip_install())
            .arg("-r")
            .arg("requirements.in")
            .arg("--no-verify-hashes")
            .arg("--show-settings"), @"
    ...
             link_mode: Clone,
             compile_bytecode: false,
             sources: None,
    -        hash_checking: Some(
    -            Verify,
    -        ),
    +        hash_checking: None,
             upgrade: Upgrade {
… trimmed for the evaluation dataset …
    +            AddBounds,
    +            PackageConflicts,
    +            ExtraBuildDependencies,
    +            DetectModuleConflicts,
    +            FormatCommand,
    +            NativeAuth,
    +            S3Endpoint,
    +            CacheSize,
    +            CachePhysicalSpace,
    +            InitProjectFlag,
    +            WorkspaceMetadata,
    +            WorkspaceDir,
    +            WorkspaceList,
    +            SbomExport,
    +            AuthHelper,
    +            DirectPublish,
    +            TargetWorkspaceDiscovery,
    +            MetadataJson,
    +            GcsEndpoint,
    +            AdjustUlimit,
    +            SpecialCondaEnvNames,
    +            RelocatableEnvsDefault,
    +            PublishRequireNormalized,
    +            AuditCommand,
    +            ProjectDirectoryMustExist,
    +            IndexExcludeNewer,
    +            AzureEndpoint,
    +            TomlBackwardsCompatibility,
    +            MalwareCheck,
    +            VenvSafeClear,
    +            CheckCommand,
    +            PackagedInit,
    +            CentralizedProjectEnvs,
    +            ToolInstallLocks,
    +            WorkspaceListScripts,
    +            NoDistutilsPatch,
    +            IndexHashAlgorithm,
    +            LockfileFormatCheck,
    +            LockWithoutMetadata,
    +            TarCodec,
    +        ],
         },
         python_preference: Managed,
         python_downloads: Automatic,
    ...
    "
    );

    diff_uv_snapshot!(
        context.filters(),
        &baseline,
        add_shared_args(context.version()).arg("--show-settings").arg("--preview").arg("--no-preview"),
        @""
    );

    // Compare against output of `--preview` alone.
    diff_uv_snapshot!(context.filters(), &preview, add_shared_args(context.version()).arg("--show-settings").arg("--preview").arg("--preview-features").arg("python-install-default"), @""
    );

    let preview_features = diff_uv_snapshot!(context.filters(), &baseline, add_shared_args(context.version()).arg("--show-settings").arg("--preview-features").arg("python-install-default,json-output"), @"
    ...
         },
         show_settings: true,
         preview: Preview {
    -        flags: [],
    +        flags: [
    +            PythonInstallDefault,
    +            JsonOutput,
    +        ],
         },
         python_preference: Managed,
         python_downloads: Automatic,
    ...
    "
    );

    let canonical_command_features = capture_uv_snapshot!(
        context.filters(),
        add_shared_args(context.version())
            .arg("--show-settings")
