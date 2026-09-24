use std::process::Command;

use assert_fs::prelude::*;
use url::Url;
use uv_static::EnvVars;

use uv_test::{TestContext, capture_uv_snapshot, diff_uv_snapshot, uv_snapshot};

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

/// Named index arguments must resolve identically to their explicit CLI spellings.
#[test]
#[cfg_attr(
    windows,
    ignore = "Configuration tests are not yet supported on Windows"
)]
fn index_by_name() -> anyhow::Result<()> {
    let context = uv_test::test_context!("3.12");
    // `explicit` and `default` are supported together; use both to test overriding behaviour.
    context
        .temp_dir
        .child("uv.toml")
        .write_str(indoc::indoc! {r#"
        [[index]]
        name = "internal"
        url = "https://example.invalid/simple"
        explicit = true
        default = true
    "#})?;

    let show_settings = || {
        let mut command = add_shared_args(context.pip_compile());
        command.arg("requirements.in").arg("--show-settings");
        command
    };

    for argument in ["--index", "--default-index"] {
        let named = capture_uv_snapshot!(
            context.filters(),
            show_settings()
                .arg(argument)
                .arg("internal")
                .arg("--preview-features")
                .arg("index-by-name")
        );
        let explicit = capture_uv_snapshot!(
            context.filters(),
            show_settings()
                .arg(argument)
                .arg("internal=https://example.invalid/simple")
                .arg("--preview-features")
                .arg("index-by-name")
        );

        // Selecting a name must match spelling out its URL with the same CLI role.
        assert_eq!(named, explicit, "{argument}");
    }

    let commands: [fn(&TestContext) -> Command; 4] = [
        TestContext::lock,
        TestContext::sync,
        TestContext::venv,
        TestContext::pip_list,
    ];

    for command in commands {
        for argument in ["--index", "--default-index"] {
            let named = capture_uv_snapshot!(
                context.filters(),
                add_shared_args(command(&context))
                    .arg("--show-settings")
                    .arg(argument)
                    .arg("internal")
                    .arg("--preview-features")
                    .arg("index-by-name")
            );
            let explicit = capture_uv_snapshot!(
                context.filters(),
                add_shared_args(command(&context))
                    .arg("--show-settings")
                    .arg(argument)
                    .arg("internal=https://example.invalid/simple")
                    .arg("--preview-features")
                    .arg("index-by-name")
            );

            assert_eq!(named, explicit, "{argument}");
        }
    }

    let explicit = capture_uv_snapshot!(
        context.filters(),
        show_settings()
            .arg("--index")
            .arg("internal=https://example.invalid/simple")
    );

    // Without preview, configured names resolve identically but produce a preview warning.
    diff_uv_snapshot!(context.filters(), &explicit, show_settings()
        .arg("--index")
        .arg("internal"), @"
    ...
             reinstall: None,
         },
     }
    +
    +----- stderr -----
    +warning: Referencing an index by name is experimental and may change without warning. Pass `--preview-features index-by-name` to disable this warning.
    ...
    ");

    // With preview, an unknown name is reported as an index rather than a missing path.
    uv_snapshot!(context.filters(), add_shared_args(context.pip_compile())
        .arg("requirements.in")
        .arg("--index")
        .arg("missing")
        .arg("--preview-features")
        .arg("index-by-name"), @"
    exit_code: 2 (failure)
    ----- stderr -----
    error: Could not find an index named `missing`
    ");

    Ok(())
}

/// Preview determines whether a named index or matching directory takes precedence.
#[test]
#[cfg_attr(
    windows,
    ignore = "Configuration tests are not yet supported on Windows"
)]
fn index_by_name_with_matching_path() -> anyhow::Result<()> {
    let context = uv_test::test_context!("3.12");
    context
        .temp_dir
        .child("uv.toml")
        .write_str(indoc::indoc! {r#"
        [[index]]
        name = "internal"
        url = "https://example.invalid/simple"
    "#})?;

    let show_settings = || {
        let mut command = add_shared_args(context.pip_compile());
        command.arg("requirements.in").arg("--show-settings");
        command
    };
    context.temp_dir.child("internal").create_dir_all()?;

    let path = capture_uv_snapshot!(
        context.filters(),
        show_settings().arg("--index").arg("./internal")
    );

    // Without preview, an existing path takes precedence and produces a disambiguation warning.
    diff_uv_snapshot!(context.filters(), &path, show_settings()
        .arg("--index")
        .arg("internal"), @"
    ...
                                     fragment: None,
                                 },
                                 given: Some(
    -                                \"./internal\",
    +                                \"internal\",
                                 ),
                                 expanded: false,
                             },
    ...
             reinstall: None,
         },
     }
    +
    +----- stderr -----
    +warning: Relative paths passed to `--index` or `--default-index` should be disambiguated from index names (use `./internal`). Support for ambiguous values will be removed in the future
    ...
    ");

    let named = capture_uv_snapshot!(
        context.filters(),
        show_settings()
            .arg("--index")
            .arg("internal")
            .arg("--preview-features")
            .arg("index-by-name")
    );
    let explicit = capture_uv_snapshot!(
        context.filters(),
        show_settings()
            .arg("--index")
            .arg("internal=https://example.invalid/simple")
            .arg("--preview-features")
            .arg("index-by-name")
    );

    // With preview, the configured name takes precedence over the existing path.
    assert_eq!(named, explicit);

    Ok(())
}

/// User-configured named indexes retain settings that cannot be expressed on the CLI.
#[test]
#[cfg_attr(
    windows,
    ignore = "Configuration tests are not yet supported on Windows"
)]
fn index_by_name_from_user_configuration() -> anyhow::Result<()> {
    let context = uv_test::test_context!("3.12");
    let user_configuration = context.user_config_dir.child("uv");
    user_configuration.create_dir_all()?;
    user_configuration
        .child("uv.toml")
        .write_str(indoc::indoc! {r#"
        [[index]]
        name = "internal"
        url = "https://example.invalid/simple"
        authenticate = "always"
    "#})?;

    let show_settings = || {
        let mut command = add_shared_args(context.pip_compile());
        command.arg("requirements.in").arg("--show-settings");
        command
    };

    let index = capture_uv_snapshot!(
        context.filters(),
        show_settings()
            .arg("--index")
            .arg("internal=https://example.invalid/simple")
            .arg("--preview-features")
            .arg("index-by-name")
    );

    // User-configured names must preserve index settings that the CLI cannot express.
    diff_uv_snapshot!(context.filters(), &index, show_settings()
        .arg("--index")
        .arg("internal")
        .arg("--preview-features")
        .arg("index-by-name"), @"
    ...
                         ),
                         format: Simple,
                         publish_url: None,
    -                    authenticate: Auto,
    +                    authenticate: Always,
                         ignore_error_codes: None,
                         cache_control: None,
                         hash_algorithm: None,
    ...
    ");

    Ok(())
}

/// Tool commands resolve configured indexes by name.
#[test]
#[cfg_attr(
    windows,
    ignore = "Configuration tests are not yet supported on Windows"
)]
fn tool_index_by_name() -> anyhow::Result<()> {
    let context = uv_test::test_context!("3.12");
    let configuration = context.temp_dir.child("uv.toml");
    // `explicit` and `default` are supported together; use both to test overriding behaviour.
    configuration.write_str(indoc::indoc! {r#"
        [[index]]
        name = "internal"
        url = "https://example.invalid/simple"
        explicit = true
        default = true
    "#})?;

    let tools: [fn(&TestContext) -> Command; 3] = [
        TestContext::tool_run,
        TestContext::tool_install,
        TestContext::tool_upgrade,
    ];

    for tool in tools {
        let show_settings = || {
            let mut command = add_shared_args(tool(&context));
            command
                .arg("--show-settings")
                .arg("--config-file")
                .arg(configuration.path())
                .arg("--preview-features")
                .arg("index-by-name");
            command
        };

        for argument in ["--index", "--default-index"] {
            let named = capture_uv_snapshot!(
                context.filters(),
                show_settings()
                    .arg(argument)
                    .arg("internal")
                    .arg("iniconfig")
            );
            let explicit = capture_uv_snapshot!(
                context.filters(),
                show_settings()
                    .arg(argument)
                    .arg("internal=https://example.invalid/simple")
                    .arg("iniconfig")
            );

            assert_eq!(named, explicit, "{argument}");
        }
    }

    Ok(())
}

/// Named relative indexes remain relative to their configuration under `--directory`.
#[test]
#[cfg_attr(
    windows,
    ignore = "Configuration tests are not yet supported on Windows"
)]
fn index_by_name_with_directory() -> anyhow::Result<()> {
    let context = uv_test::test_context!("3.12").with_filter((
        r#"given: Some\(\s+"file://[^"]+/configuration/configured-index",\s+\)"#,
        "given: None",
    ));
    let configuration_directory = context.temp_dir.child("configuration");
    configuration_directory.create_dir_all()?;
    let configuration_file = configuration_directory.child("uv.toml");
    configuration_file.write_str(indoc::indoc! {r#"
        [[index]]
        name = "internal"
        url = "./configured-index"
    "#})?;

    let project_directory = context.temp_dir.child("project");
    project_directory.create_dir_all()?;

    let show_settings = || {
        let mut command = add_shared_args(context.pip_compile());
        command
            .arg("requirements.in")
            .arg("--show-settings")
            .arg("--config-file")
            .arg(configuration_file.path())
            .arg("--directory")
            .arg("project")
            .arg("--preview-features")
            .arg("index-by-name");
        command
    };

    let configured_index = configuration_directory.child("configured-index");
    let configured_index = Url::from_file_path(configured_index.path()).map_err(|()| {
        anyhow::anyhow!("Failed to convert the configured index path to a file URL")
    })?;
    let configured_index = format!("internal={configured_index}");

    for argument in ["--index", "--default-index"] {
        let named = capture_uv_snapshot!(
            context.filters(),
            show_settings().arg(argument).arg("internal")
        );
        let explicit = capture_uv_snapshot!(
            context.filters(),
            show_settings().arg(argument).arg(&configured_index)
        );

        // Resolving the configured name must preserve its original configuration directory.
        assert_eq!(named, explicit, "{argument}");
    }

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
    +            IndexByName,
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
