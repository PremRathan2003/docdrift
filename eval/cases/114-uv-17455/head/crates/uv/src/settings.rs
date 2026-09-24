use std::env::VarError;
use std::fmt;
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::process;
use std::str::FromStr;
use std::time::Duration;

use anyhow::{Result, bail};
use rustc_hash::FxHashSet;

use uv_audit::{VulnerabilityID, VulnerabilityServiceFormat};
use uv_auth::Service;
use uv_cache::{CacheArgs, Refresh};
use uv_cli::comma::CommaSeparatedRequirements;
use uv_cli::{
    AddArgs, AuditArgs, AuditCommonArgs, AuditOutputFormat, AuthLoginArgs, AuthLogoutArgs,
    AuthTokenArgs, ColorChoice, ExternalCommand, GlobalArgs, InitArgs, ListFormat, LockArgs, Maybe,
    MetadataArgs, PipCheckArgs, PipCompileArgs, PipFreezeArgs, PipInstallArgs, PipListArgs,
    PipShowArgs, PipSyncArgs, PipTreeArgs, PipUninstallArgs, ProjectDependencyGroupsArgs,
    PythonFindArgs, PythonInstallArgs, PythonListArgs, PythonListFormat, PythonPinArgs,
    PythonUninstallArgs, PythonUpgradeArgs, RemoveArgs, RunArgs, SyncArgs, SyncFormat,
    ToolAuditArgs, ToolDirArgs, ToolInstallArgs, ToolListArgs, ToolRunArgs, ToolUninstallArgs,
    TreeArgs, TreeFormat, UpgradeArgs, VenvArgs, VersionArgs, VersionBumpSpec, VersionFormat,
};
use uv_cli::{
    AuthorFrom, BuildArgs, BuildOptionsArgs, CheckArgs, ExcludeNewerArgs, ExportArgs, FormatArgs,
    HashCheckingArgs, PackageExcludeNewerArgs, PublishArgs, PythonDirArgs, RegistryClientArgs,
    ResolverArgs, ResolverInstallerArgs, ToolUpgradeArgs,
    options::{
        Flag, FlagSource, IntoPipOptions, check_conflicts, flag, resolve_flag, resolve_flag_pair,
        resolver_installer_options, resolver_options,
    },
};
use uv_client::{Certificates, Connectivity};
use uv_configuration::{
    BuildIsolation, BuildOptions, Concurrency, DependencyGroups, DevMode, DryRun, EditableMode,
    EnvFile, ExcludeDependency, ExportFormat, ExtrasSpecification, GitLfsSetting, HashCheckingMode,
    IndexStrategy, InstallOptions, KeyringProviderType, NoBinary, NoBuild, NoSources, Override,
    PackageOverride, PipCompileFormat, ProjectBuildBackend, ProxyUrl, Reinstall, RequiredVersion,
    TargetTriple, TrustedHost, TrustedPublishing, Upgrade, VersionControlSystem,
};
use uv_distribution_types::{
    ConfigSettings, DependencyMetadata, ExtraBuildVariables, Index, IndexLocations, IndexUrl,
    PackageConfigSettings, Requirement,
};
use uv_install_wheel::LinkMode;
use uv_normalize::{ExtraName, PackageName, PipGroupName};
use uv_pep440::Version;
use uv_pep508::{MarkerTree, RequirementOrigin};
use uv_preview::Preview;
use uv_pypi_types::SupportedEnvironments;
use uv_python::{Prefix, PythonDownloads, PythonPreference, PythonVersion, Target};
use uv_redacted::DisplaySafeUrl;
use uv_resolver::{
    AnnotationStyle, DependencyMode, ExcludeNewer, ExcludeNewerOverride, ExcludeNewerPackage,
    ForkStrategy, Prerelease, PrereleaseMode, PrereleasePackage, ResolutionMode,
};
use uv_settings::{
    Combine, EnvironmentOptions, FilesystemOptions, IndexOptions, MalwareCheckSettings, Options,
    PipOptions, PreviewFeaturesOption, PreviewOption, PublishOptions, PythonInstallMirrors,
    ResolverInstallerOptions, ResolverInstallerSchema, ResolverOptions,
};
use uv_static::EnvVars;
use uv_torch::{AmdGpuArchitecture, TorchMode};
use uv_warnings::warn_user_once;
use uv_workspace::pyproject::{DependencyType, ExtraBuildDependencies, OverrideDependency};
use uv_workspace::pyproject_mut::AddBoundsKind;

use crate::commands::pip::operations::Modifications;
use crate::commands::{
… trimmed for the evaluation dataset …
            show_resolution,
            installer,
            build,
            refresh,
            lfs,
            python,
            python_platform,
            torch_backend,
            generate_shell_completion: _,
        } = args;

        // If `--upgrade` was passed explicitly, warn.
        if installer.upgrade || !installer.upgrade_package.is_empty() {
            if with.is_empty() && with_requirements.is_empty() {
                warn_user_once!(
                    "Tools cannot be upgraded via `{invocation_source}`; use `uv tool upgrade --all` to upgrade all installed tools, or `{invocation_source} package@latest` to run the latest version of a tool."
                );
            } else {
                warn_user_once!(
                    "Tools cannot be upgraded via `{invocation_source}`; use `uv tool upgrade --all` to upgrade all installed tools, `{invocation_source} package@latest` to run the latest version of a tool, or `{invocation_source} --refresh package` to upgrade any `--with` dependencies."
                );
            }
        }

        // If `--reinstall` was passed explicitly, warn.
        if installer.reinstall.reinstall || !installer.reinstall.reinstall_package.is_empty() {
            if with.is_empty() && with_requirements.is_empty() {
                warn_user_once!(
                    "Tools cannot be reinstalled via `{invocation_source}`; use `uv tool upgrade --all --reinstall` to reinstall all installed tools, `{invocation_source} package@latest` to run the latest version of a tool, or `uv cache prune` to clear any cached tool environments."
                );
            } else {
                warn_user_once!(
                    "Tools cannot be reinstalled via `{invocation_source}`; use `uv tool upgrade --all --reinstall` to reinstall all installed tools, `{invocation_source} package@latest` to run the latest version of a tool, `{invocation_source} --refresh package` to reinstall any `--with` dependencies, or `uv cache prune` to clear any cached tool environments."
                );
            }
        }

        let filesystem_options = filesystem.map(FilesystemOptions::into_options);

        let options = resolver_installer_options_with_environment(
            resolver_installer_options(
                installer,
                build,
                filesystem_options
                    .as_ref()
                    .and_then(|options| options.top_level.index.as_deref())
                    .unwrap_or_default(),
            )?,
            &environment,
        )
        .combine(ResolverInstallerOptions::from(
            filesystem_options
                .as_ref()
                .map(|options| options.top_level.clone())
                .unwrap_or_default(),
        ));

        let filesystem_install_mirrors = filesystem_options
            .map(|options| options.install_mirrors.clone())
            .unwrap_or_default();

        let mut settings = ResolverInstallerSettings::from(options.clone());
        if torch_backend.is_some() {
            settings.resolver.torch_backend = torch_backend;
        }
        let lfs = GitLfsSetting::new(lfs.then_some(true), environment.lfs);

        // Resolve flags from CLI and environment variables.
        let isolated = isolated || environment.isolated.value == Some(true);
        let show_resolution = show_resolution || environment.show_resolution.value == Some(true);
        let no_env_file = no_env_file || environment.no_env_file.value == Some(true);

        Ok(Self {
            command,
            from,
            with: with
                .into_iter()
                .flat_map(CommaSeparatedRequirements::into_iter)
                .collect(),
            with_editable: with_editable
                .into_iter()
                .flat_map(CommaSeparatedRequirements::into_iter)
                .collect(),
            with_requirements: with_requirements
                .into_iter()
                .filter_map(Maybe::into_option)
                .collect(),
            constraints: constraints
… trimmed for the evaluation dataset …
    pub(crate) refresh: Refresh,
    pub(crate) options: ResolverInstallerOptions,
    pub(crate) settings: ResolverInstallerSettings,
    pub(crate) force: bool,
    pub(crate) editable: bool,
    pub(crate) install_mirrors: PythonInstallMirrors,
}

impl ToolInstallSettings {
    /// Resolve the [`ToolInstallSettings`] from the CLI and filesystem configuration.
    pub(crate) fn resolve(
        args: ToolInstallArgs,
        filesystem: Option<FilesystemOptions>,
        environment: EnvironmentOptions,
    ) -> anyhow::Result<Self> {
        let ToolInstallArgs {
            package,
            editable,
            from,
            with,
            with_editable,
            with_requirements,
            with_executables_from,
            constraints,
            overrides,
            excludes,
            build_constraints,
            lfs,
            installer,
            force,
            build,
            refresh,
            python,
            python_platform,
            torch_backend,
        } = args;

        let filesystem_options = filesystem.map(FilesystemOptions::into_options);

        let options = resolver_installer_options_with_environment(
            resolver_installer_options(
                installer,
                build,
                filesystem_options
                    .as_ref()
                    .and_then(|options| options.top_level.index.as_deref())
                    .unwrap_or_default(),
            )?,
            &environment,
        )
        .combine(ResolverInstallerOptions::from(
            filesystem_options
                .as_ref()
                .map(|options| options.top_level.clone())
                .unwrap_or_default(),
        ));

        let filesystem_install_mirrors = filesystem_options
            .map(|options| options.install_mirrors.clone())
            .unwrap_or_default();

        let mut settings = ResolverInstallerSettings::from(options.clone());
        if torch_backend.is_some() {
            settings.resolver.torch_backend = torch_backend;
        }
        let lfs = GitLfsSetting::new(lfs.then_some(true), environment.lfs);

        Ok(Self {
            package,
            from,
            with: with
                .into_iter()
                .flat_map(CommaSeparatedRequirements::into_iter)
                .collect(),
            with_editable: with_editable
                .into_iter()
                .flat_map(CommaSeparatedRequirements::into_iter)
                .collect(),
            with_requirements: with_requirements
                .into_iter()
                .filter_map(Maybe::into_option)
                .collect(),
            with_executables_from: with_executables_from
                .into_iter()
                .flat_map(CommaSeparatedRequirements::into_iter)
                .collect(),
            constraints: constraints
                .into_iter()
… trimmed for the evaluation dataset …
            reinstall,
            registry_client,
            version_selection,
            config_setting,
            config_setting_package: config_settings_package,
            build_isolation,
            exclude_newer,
            link_mode,
            compile_bytecode,
            sources,
            build,
        } = args;

        if upgrade {
            warn_user_once!("`--upgrade` is enabled by default on `uv tool upgrade`");
        }
        if !upgrade_package.is_empty() {
            warn_user_once!("`--upgrade-package` is enabled by default on `uv tool upgrade`");
        }

        // Enable `--upgrade` by default.
        let installer = ResolverInstallerArgs {
            index_args,
            upgrade: upgrade_package.is_empty(),
            no_upgrade: false,
            upgrade_package,
            upgrade_group,
            reinstall,
            registry_client,
            version_selection,
            config_setting,
            config_settings_package,
            build_isolation,
            exclude_newer,
            link_mode,
            compile_bytecode,
            sources,
        };

        let args = resolver_installer_options_with_environment(
            resolver_installer_options(installer, build, configured_indexes(filesystem.as_ref()))?,
            environment,
        );
        let filesystem = filesystem.map(FilesystemOptions::into_options);
        let filesystem_install_mirrors = filesystem
            .clone()
            .map(|options| options.install_mirrors)
            .unwrap_or_default();
        let top_level = ResolverInstallerOptions::from(
            filesystem
                .map(|options| options.top_level)
                .unwrap_or_default(),
        );

        Ok(Self {
            names: if all { vec![] } else { name },
            python: python.and_then(Maybe::into_option),
            python_platform,
            args,
            filesystem: top_level,
            install_mirrors: environment
                .install_mirrors
                .clone()
                .combine(filesystem_install_mirrors),
        })
    }
}

/// The resolved settings to use for a `tool list` invocation.
#[derive(Debug, Clone)]
pub(crate) struct ToolListSettings {
    pub(crate) show_paths: bool,
    pub(crate) show_version_specifiers: bool,
    pub(crate) show_with: bool,
    pub(crate) show_extras: bool,
    pub(crate) show_python: bool,
    pub(crate) outdated: bool,
    pub(crate) args: ResolverInstallerOptions,
    pub(crate) filesystem: ResolverInstallerOptions,
}

… trimmed for the evaluation dataset …
        );

        let (no_install_project, only_install_project) = resolve_flag_pair(
            no_install_project,
            only_install_project,
            "no-install-project",
            "only-install-project",
            Some(environment.no_install_project),
            Some(environment.only_install_project),
        );
        let (no_install_workspace, only_install_workspace) = resolve_flag_pair(
            no_install_workspace,
            only_install_workspace,
            "no-install-workspace",
            "only-install-workspace",
            Some(environment.no_install_workspace),
            Some(environment.only_install_workspace),
        );
        let (no_install_local, only_install_local) = resolve_flag_pair(
            no_install_local,
            only_install_local,
            "no-install-local",
            "only-install-local",
            Some(environment.no_install_local),
            Some(environment.only_install_local),
        );
        check_conflicts(no_install_project, only_install_project)?;
        check_conflicts(no_install_workspace, only_install_workspace)?;
        check_conflicts(no_install_local, only_install_local)?;

        let dependency_type = if let Some(extra) = optional {
            DependencyType::Optional(extra)
        } else if let Some(group) = group {
            DependencyType::Group(group)
        } else if dev {
            DependencyType::Dev
        } else {
            DependencyType::Production
        };

        // If the user passed an `--index-url` or `--extra-index-url`, warn.
        if installer
            .index_args
            .index_url
            .as_ref()
            .is_some_and(Maybe::is_some)
        {
            if script.is_some() {
                warn_user_once!(
                    "Indexes specified via `--index-url` will not be persisted to the script; use `--default-index` instead."
                );
            } else {
                warn_user_once!(
                    "Indexes specified via `--index-url` will not be persisted to the `pyproject.toml` file; use `--default-index` instead."
                );
            }
        }

        if installer
            .index_args
            .extra_index_url
            .as_ref()
            .is_some_and(|extra_index_url| extra_index_url.iter().any(Maybe::is_some))
        {
            if script.is_some() {
                warn_user_once!(
                    "Indexes specified via `--extra-index-url` will not be persisted to the script; use `--index` instead."
                );
            } else {
                warn_user_once!(
                    "Indexes specified via `--extra-index-url` will not be persisted to the `pyproject.toml` file; use `--index` instead."
                );
            }
        }

        let filesystem_install_mirrors = filesystem
            .as_ref()
            .map(|fs| fs.install_mirrors.clone())
            .unwrap_or_default();

… trimmed for the evaluation dataset …
        let no_install_package_flag = if no_install_package.is_empty() {
            Flag::disabled()
        } else {
            Flag::from_cli("no-install-package")
        };
        let only_install_package_flag = if only_install_package.is_empty() {
            Flag::disabled()
        } else {
            Flag::from_cli("only-install-package")
        };

        for install_flag in [
            no_install_project,
            no_install_workspace,
            no_install_local,
            only_install_project,
            only_install_workspace,
            only_install_local,
            no_install_package_flag,
            only_install_package_flag,
        ] {
            check_conflicts(install_flag, frozen)?;
            check_conflicts(install_flag, no_sync)?;
        }

        let no_install_project = no_install_project.is_enabled();
        let only_install_project = only_install_project.is_enabled();
        let no_install_workspace = no_install_workspace.is_enabled();
        let only_install_workspace = only_install_workspace.is_enabled();
        let no_install_local = no_install_local.is_enabled();
        let only_install_local = only_install_local.is_enabled();

        let malware_settings = MalwareCheckSettings::resolve(filesystem.as_ref(), &environment);
        let active = flag(active, no_active, "active")?;
        let workspace = flag(workspace, no_workspace, "workspace")?;
        let editable = EditableMode::from_args(
            flag(editable.into(), no_editable.into(), "editable")?,
            no_editable_package,
        );
        let refresh = Refresh::try_from(refresh)?;
        let options =
            resolver_installer_options(installer, build, configured_indexes(filesystem.as_ref()))?;
        let indexes = options.indexes.index.clone().unwrap_or_default();

        Ok(Self {
            lock_check: resolve_lock_check(locked),
            frozen: resolve_frozen(frozen),
            active,
            no_sync: no_sync.is_enabled(),
            packages,
            requirements,
            constraints: constraints
                .into_iter()
                .filter_map(Maybe::into_option)
                .collect(),
            marker,
            dependency_type,
            raw,
            bounds,
            rev,
            tag,
            branch,
            lfs,
            package,
            script,
            python: python.and_then(Maybe::into_option),
            workspace,
            no_install_project,
            only_install_project,
            no_install_workspace,
            only_install_workspace,
            no_install_local,
            only_install_local,
            no_install_package,
            only_install_package,
            editable,
            extras: extra.unwrap_or_default(),
            refresh,
            indexes,
            settings: ResolverInstallerSettings::combine(options, filesystem, &environment),
            install_mirrors: environment
                .install_mirrors
… trimmed for the evaluation dataset …
                PipOptions {
                    python: python.and_then(Maybe::into_option),
                    system: flag(system, no_system, "system")?,
                    no_build: flag(no_build, build, "build")?,
                    no_binary,
                    only_binary,
                    extra,
                    all_extras: flag(all_extras, no_all_extras, "all-extras")?,
                    no_deps: flag(no_deps, deps, "deps")?,
                    group: Some(group),
                    output_file,
                    no_strip_extras: flag(no_strip_extras, strip_extras, "strip-extras")?,
                    no_strip_markers: flag(no_strip_markers, strip_markers, "strip-markers")?,
                    no_annotate: flag(no_annotate, annotate, "annotate")?,
                    no_header: flag(no_header, header, "header")?,
                    custom_compile_command,
                    generate_hashes: flag(generate_hashes, no_generate_hashes, "generate-hashes")?,
                    python_version,
                    python_platform,
                    universal: flag(universal, no_universal, "universal")?,
                    no_emit_package,
                    emit_index_url: flag(emit_index_url, no_emit_index_url, "emit-index-url")?,
                    emit_find_links: flag(emit_find_links, no_emit_find_links, "emit-find-links")?,
                    emit_build_options: flag(
                        emit_build_options,
                        no_emit_build_options,
                        "emit-build-options",
                    )?,
                    emit_marker_expression: flag(
                        emit_marker_expression,
                        no_emit_marker_expression,
                        "emit-marker-expression",
                    )?,
                    emit_index_annotation: flag(
                        emit_index_annotation,
                        no_emit_index_annotation,
                        "emit-index-annotation",
                    )?,
                    annotation_style,
                    torch_backend,
                    ..resolver.into_pip_options(configured_indexes(filesystem.as_ref()))?
                },
                filesystem,
                environment,
            ),
        })
    }
}

/// The resolved settings to use for a `pip sync` invocation.
#[derive(Debug, Clone)]
pub(crate) struct PipSyncSettings {
    pub(crate) src_file: Vec<PathBuf>,
    pub(crate) constraints: Vec<PathBuf>,
    pub(crate) build_constraints: Vec<PathBuf>,
    pub(crate) dry_run: DryRun,
    pub(crate) refresh: Refresh,
    pub(crate) settings: PipSettings,
}

impl PipSyncSettings {
    /// Resolve the [`PipSyncSettings`] from the CLI and filesystem configuration.
    pub(crate) fn resolve(
        args: Box<PipSyncArgs>,
        filesystem: Option<FilesystemOptions>,
        environment: EnvironmentOptions,
    ) -> anyhow::Result<Self> {
        let PipSyncArgs {
            src_file,
            constraints,
            build_constraints,
            extra,
            all_extras,
            no_all_extras,
            group,
            installer,
            refresh,
            hash_checking:
                HashCheckingArgs {
                    require_hashes,
                    no_require_hashes,
… trimmed for the evaluation dataset …
        Ok(Self {
            src_file,
            constraints: constraints
                .into_iter()
                .filter_map(Maybe::into_option)
                .collect(),
            build_constraints: build_constraints
                .into_iter()
                .filter_map(Maybe::into_option)
                .collect(),
            dry_run: DryRun::from_args(dry_run),
            refresh: Refresh::try_from(refresh)?,
            settings: PipSettings::combine(
                PipOptions {
                    python: python.and_then(Maybe::into_option),
                    system: flag(system, no_system, "system")?,
                    break_system_packages: flag(
                        break_system_packages,
                        no_break_system_packages,
                        "break-system-packages",
                    )?,
                    target,
                    prefix,
                    require_hashes: flag(require_hashes, no_require_hashes, "require-hashes")?,
                    verify_hashes: flag(verify_hashes, no_verify_hashes, "verify-hashes")?,
                    no_build: flag(no_build, build, "build")?,
                    no_binary,
                    only_binary,
                    allow_empty_requirements: flag(
                        allow_empty_requirements,
                        no_allow_empty_requirements,
                        "allow-empty-requirements",
                    )?,
                    python_version,
                    python_platform,
                    strict: flag(strict, no_strict, "strict")?,
                    extra,
                    all_extras: flag(all_extras, no_all_extras, "all-extras")?,
                    group: Some(group),
                    torch_backend,
                    ..installer.into_pip_options(configured_indexes(filesystem.as_ref()))?
                },
                filesystem,
                environment,
            ),
        })
    }
}

/// The resolved settings to use for a `pip install` invocation.
#[derive(Debug, Clone)]
pub(crate) struct PipInstallSettings {
    pub(crate) package: Vec<String>,
    pub(crate) requirements: Vec<PathBuf>,
    pub(crate) editables: Vec<String>,
    pub(crate) editable: Option<EditableMode>,
    pub(crate) constraints: Vec<PathBuf>,
    pub(crate) overrides: Vec<PathBuf>,
    pub(crate) excludes: Vec<PathBuf>,
    pub(crate) build_constraints: Vec<PathBuf>,
    pub(crate) dry_run: DryRun,
    pub(crate) constraints_from_workspace: Vec<Requirement>,
    pub(crate) overrides_from_workspace: Vec<Override<Requirement>>,
    pub(crate) excludes_from_workspace: Vec<ExcludeDependency>,
    pub(crate) build_constraints_from_workspace: Vec<Requirement>,
    pub(crate) modifications: Modifications,
    pub(crate) refresh: Refresh,
    pub(crate) settings: PipSettings,
}

impl PipInstallSettings {
    /// Resolve the [`PipInstallSettings`] from the CLI and filesystem configuration.
    pub(crate) fn resolve(
        args: PipInstallArgs,
        filesystem: Option<FilesystemOptions>,
        environment: EnvironmentOptions,
    ) -> anyhow::Result<Self> {
        let PipInstallArgs {
            package,
            requirements,
            editable,
… trimmed for the evaluation dataset …
            excludes_from_workspace,
            build_constraints_from_workspace,
            modifications: if flag(exact, inexact, "inexact")?.unwrap_or(false) {
                Modifications::Exact
            } else {
                Modifications::Sufficient
            },
            editable: EditableMode::from_args(
                if no_editable || environment.no_editable.value == Some(true) {
                    Some(false)
                } else {
                    None
                },
                no_editable_package,
            ),
            refresh: Refresh::try_from(refresh)?,
            settings: PipSettings::combine(
                PipOptions {
                    python: python.and_then(Maybe::into_option),
                    system: flag(system, no_system, "system")?,
                    break_system_packages: flag(
                        break_system_packages,
                        no_break_system_packages,
                        "break-system-packages",
                    )?,
                    target,
                    prefix,
                    no_build: flag(no_build, build, "build")?,
                    no_binary,
                    only_binary,
                    strict: flag(strict, no_strict, "strict")?,
                    extra,
                    all_extras: flag(all_extras, no_all_extras, "all-extras")?,
                    group: Some(group),
                    no_deps: flag(no_deps, deps, "deps")?,
                    python_version,
                    python_platform,
                    require_hashes: flag(require_hashes, no_require_hashes, "require-hashes")?,
                    verify_hashes: flag(verify_hashes, no_verify_hashes, "verify-hashes")?,
                    torch_backend,
                    ..installer.into_pip_options(configured_indexes(filesystem.as_ref()))?
                },
                filesystem,
                environment,
            ),
        })
    }
}

/// The resolved settings to use for a `pip uninstall` invocation.
#[derive(Debug, Clone)]
pub(crate) struct PipUninstallSettings {
    pub(crate) package: Vec<String>,
    pub(crate) requirements: Vec<PathBuf>,
    pub(crate) dry_run: DryRun,
    pub(crate) settings: PipSettings,
}

impl PipUninstallSettings {
    /// Resolve the [`PipUninstallSettings`] from the CLI and filesystem configuration.
    pub(crate) fn resolve(
        args: PipUninstallArgs,
        filesystem: Option<FilesystemOptions>,
        environment: EnvironmentOptions,
    ) -> anyhow::Result<Self> {
        let PipUninstallArgs {
            package,
            requirements,
            python,
            keyring_provider,
            system,
            no_system,
            break_system_packages,
            no_break_system_packages,
            target,
            prefix,
            dry_run,
            compat_args: _,
        } = args;

        Ok(Self {
… trimmed for the evaluation dataset …
    pub(crate) settings: PipSettings,
}

impl PipListSettings {
    /// Resolve the [`PipListSettings`] from the CLI and filesystem configuration.
    pub(crate) fn resolve(
        args: PipListArgs,
        filesystem: Option<FilesystemOptions>,
        environment: EnvironmentOptions,
    ) -> anyhow::Result<Self> {
        let PipListArgs {
            editable,
            exclude_editable,
            exclude,
            format,
            outdated,
            no_outdated,
            strict,
            no_strict,
            fetch,
            python,
            system,
            no_system,
            target,
            prefix,
            compat_args: _,
        } = args;

        Ok(Self {
            editable: flag(editable, exclude_editable, "exclude-editable")?,
            exclude: exclude.into_iter().collect(),
            format,
            outdated: flag(outdated, no_outdated, "outdated")?.unwrap_or(false),
            settings: PipSettings::combine(
                PipOptions {
                    python: python.and_then(Maybe::into_option),
                    system: flag(system, no_system, "system")?,
                    strict: flag(strict, no_strict, "strict")?,
                    target,
                    prefix,
                    ..fetch.into_pip_options(configured_indexes(filesystem.as_ref()))?
                },
                filesystem,
                environment,
            ),
        })
    }
}

/// The resolved settings to use for a `pip show` invocation.
#[derive(Debug, Clone)]
pub(crate) struct PipShowSettings {
    pub(crate) package: Vec<PackageName>,
    pub(crate) files: bool,
    pub(crate) settings: PipSettings,
}

impl PipShowSettings {
    /// Resolve the [`PipShowSettings`] from the CLI and filesystem configuration.
    pub(crate) fn resolve(
        args: PipShowArgs,
        filesystem: Option<FilesystemOptions>,
        environment: EnvironmentOptions,
    ) -> anyhow::Result<Self> {
        let PipShowArgs {
            package,
            strict,
            no_strict,
            files,
            python,
            system,
            no_system,
            target,
            prefix,
            compat_args: _,
        } = args;

        Ok(Self {
            package,
            files,
            settings: PipSettings::combine(
… trimmed for the evaluation dataset …
    pub(crate) prune: Vec<PackageName>,
    pub(crate) package: Vec<PackageName>,
    pub(crate) no_dedupe: bool,
    pub(crate) invert: bool,
    pub(crate) outdated: bool,
    pub(crate) settings: PipSettings,
}

impl PipTreeSettings {
    /// Resolve the [`PipTreeSettings`] from the CLI and workspace configuration.
    pub(crate) fn resolve(
        args: PipTreeArgs,
        filesystem: Option<FilesystemOptions>,
        environment: EnvironmentOptions,
    ) -> anyhow::Result<Self> {
        let PipTreeArgs {
            show_version_specifiers,
            tree,
            strict,
            no_strict,
            fetch,
            python,
            system,
            no_system,
            compat_args: _,
        } = args;

        Ok(Self {
            show_version_specifiers,
            depth: tree.depth,
            prune: tree.prune,
            no_dedupe: tree.no_dedupe,
            invert: tree.invert,
            package: tree.package,
            outdated: tree.outdated,
            settings: PipSettings::combine(
                PipOptions {
                    python: python.and_then(Maybe::into_option),
                    system: flag(system, no_system, "system")?,
                    strict: flag(strict, no_strict, "strict")?,
                    ..fetch.into_pip_options(configured_indexes(filesystem.as_ref()))?
                },
                filesystem,
                environment,
            ),
        })
    }
}

/// The resolved settings to use for a `pip check` invocation.
#[derive(Debug, Clone)]
pub(crate) struct PipCheckSettings {
    pub(crate) settings: PipSettings,
}

impl PipCheckSettings {
    /// Resolve the [`PipCheckSettings`] from the CLI and filesystem configuration.
    pub(crate) fn resolve(
        args: PipCheckArgs,
        filesystem: Option<FilesystemOptions>,
        environment: EnvironmentOptions,
    ) -> anyhow::Result<Self> {
        let PipCheckArgs {
            python,
            system,
            no_system,
            python_version,
            python_platform,
        } = args;

        Ok(Self {
            settings: PipSettings::combine(
                PipOptions {
                    python: python.and_then(Maybe::into_option),
                    system: flag(system, no_system, "system")?,
                    python_version,
                    python_platform,
                    ..PipOptions::default()
                },
                filesystem,
                environment,
… trimmed for the evaluation dataset …
        let (clear, no_clear) = resolve_flag_pair(
            clear,
            no_clear,
            "clear",
            "no-clear",
            Some(environment.venv_clear),
            None,
        );
        let (relocatable, no_relocatable) = resolve_flag_pair(
            relocatable,
            no_relocatable,
            "relocatable",
            "no-relocatable",
            Some(environment.venv_relocatable),
            None,
        );

        Ok(Self {
            seed,
            allow_existing,
            clear: clear.into(),
            force,
            no_clear: no_clear.into(),
            path,
            prompt,
            system_site_packages,
            no_project,
            relocatable: relocatable.into(),
            no_relocatable: no_relocatable.into(),
            refresh: Refresh::try_from(refresh)?,
            settings: PipSettings::combine(
                PipOptions {
                    python: python.and_then(Maybe::into_option),
                    system: flag(system, no_system, "system")?,
                    index_strategy,
                    keyring_provider,
                    exclude_newer,
                    exclude_newer_package: exclude_newer_package
                        .map(ExcludeNewerPackage::from_iter),
                    link_mode,
                    ..index_args.into_pip_options(configured_indexes(filesystem.as_ref()))?
                },
                filesystem,
                environment,
            ),
        })
    }
}

/// The resolved settings to use for an invocation of the uv CLI when installing dependencies.
///
/// Combines the `[tool.uv]` persistent configuration with the command-line arguments
/// ([`InstallerArgs`], represented as [`InstallerOptions`]).
#[derive(Debug, Clone)]
pub(crate) struct InstallerSettingsRef<'a> {
    pub(crate) index_locations: &'a IndexLocations,
    pub(crate) index_strategy: IndexStrategy,
    pub(crate) keyring_provider: KeyringProviderType,
    pub(crate) dependency_metadata: &'a DependencyMetadata,
    pub(crate) config_setting: &'a ConfigSettings,
    pub(crate) config_settings_package: &'a PackageConfigSettings,
    pub(crate) build_isolation: &'a BuildIsolation,
    pub(crate) extra_build_dependencies: &'a ExtraBuildDependencies,
    pub(crate) extra_build_variables: &'a ExtraBuildVariables,
    pub(crate) exclude_newer: &'a ExcludeNewer,
    pub(crate) link_mode: LinkMode,
    pub(crate) compile_bytecode: bool,
    pub(crate) reinstall: &'a Reinstall,
    pub(crate) build_options: &'a BuildOptions,
    pub(crate) sources: NoSources,
}

/// The resolved settings to use for an invocation of the uv CLI when resolving dependencies.
///
/// Combines the `[tool.uv]` persistent configuration with the command-line arguments
/// ([`ResolverArgs`], represented as [`ResolverOptions`]).
#[derive(Debug, Clone, Default)]
pub(crate) struct ResolverSettings {
    pub(crate) build_options: BuildOptions,
    pub(crate) config_setting: ConfigSettings,
    pub(crate) config_settings_package: PackageConfigSettings,
… trimmed for the evaluation dataset …
    pub(crate) fork_strategy: ForkStrategy,
    pub(crate) index_locations: IndexLocations,
    pub(crate) index_strategy: IndexStrategy,
    pub(crate) keyring_provider: KeyringProviderType,
    pub(crate) link_mode: LinkMode,
    pub(crate) build_isolation: BuildIsolation,
    pub(crate) extra_build_dependencies: ExtraBuildDependencies,
    pub(crate) extra_build_variables: ExtraBuildVariables,
    pub(crate) prerelease: Prerelease,
    pub(crate) resolution: ResolutionMode,
    pub(crate) sources: NoSources,
    pub(crate) torch_backend: Option<TorchMode>,
    pub(crate) cuda_driver_version: Option<Version>,
    pub(crate) amd_gpu_architecture: Option<AmdGpuArchitecture>,
    pub(crate) upgrade: Upgrade,
}

#[allow(deprecated)]
fn warn_if_deprecated_prerelease_mode(prerelease: PrereleaseMode) -> PrereleaseMode {
    if matches!(prerelease, PrereleaseMode::IfNecessaryOrExplicit) {
        warn_user_once!(
            "The `if-necessary-or-explicit` pre-release mode is deprecated and will be removed in a future release. Use `if-necessary` instead."
        );
        PrereleaseMode::IfNecessary
    } else {
        prerelease
    }
}

fn resolve_prerelease(global: PrereleaseMode, mut package: PrereleasePackage) -> Prerelease {
    for mode in package.values_mut() {
        *mode = warn_if_deprecated_prerelease_mode(*mode);
    }

    Prerelease {
        global: warn_if_deprecated_prerelease_mode(global),
        package,
    }
}

/// Return the indexes from the effective filesystem configuration.
fn configured_indexes(filesystem: Option<&FilesystemOptions>) -> &[Index] {
    filesystem
        .and_then(|options| options.top_level.index.as_deref())
        .unwrap_or_default()
}

impl ResolverSettings {
    /// Resolve the [`ResolverSettings`] from the CLI, environment, and filesystem configuration.
    fn resolve(
        args: ResolverArgs,
        build: BuildOptionsArgs,
        filesystem: Option<FilesystemOptions>,
        environment: &EnvironmentOptions,
    ) -> Result<Self> {
        let args = resolver_options(args, build, configured_indexes(filesystem.as_ref()))?;

        Ok(Self::combine(args, filesystem, environment))
    }

    /// Resolve the [`ResolverSettings`] from the CLI and filesystem configuration.
    fn combine(
        mut args: ResolverOptions,
        filesystem: Option<FilesystemOptions>,
        environment: &EnvironmentOptions,
    ) -> Self {
        args.no_binary_package = args
            .no_binary_package
            .or(environment.no_binary_package.clone());
        args.no_build_package = args
            .no_build_package
            .or(environment.no_build_package.clone());
        args.no_sources_package = args
            .no_sources_package
            .or(environment.no_sources_package.clone());

        // The problem is that for `upgrade`... we want to combine the two `Upgrade` structs,
        // not the individual fields.
        let options = args.combine(ResolverOptions::from(
            filesystem
                .map(FilesystemOptions::into_options)
                .map(|options| options.top_level)
                .unwrap_or_default(),
        ));

        Self {
            cuda_driver_version: environment.cuda_driver_version.clone(),
            amd_gpu_architecture: environment.amd_gpu_architecture,
            ..Self::from(options)
        }
    }
}

impl From<ResolverOptions> for ResolverSettings {
    fn from(value: ResolverOptions) -> Self {
        Self {
… trimmed for the evaluation dataset …
                    .map(Into::into)
                    .collect(),
            ),
            link_mode: value.link_mode.unwrap_or_default(),
            torch_backend: value.torch_backend,
            cuda_driver_version: None,
            amd_gpu_architecture: None,
            sources: NoSources::from_args(
                value.no_sources,
                value.no_sources_package.unwrap_or_default(),
            ),
            upgrade: value.upgrade.unwrap_or_default(),
            build_options: BuildOptions::new(
                NoBinary::from_args(value.no_binary, value.no_binary_package.unwrap_or_default()),
                NoBuild::from_args(value.no_build, value.no_build_package.unwrap_or_default()),
            ),
        }
    }
}

/// The resolved settings to use for an invocation of the uv CLI with both resolver and installer
/// capabilities.
///
/// Represents the shared settings that are used across all uv commands outside the `pip` API.
/// Analogous to the settings contained in the `[tool.uv]` table, combined with [`ResolverInstallerArgs`].
#[derive(Debug, Clone, Default)]
pub(crate) struct ResolverInstallerSettings {
    pub(crate) resolver: ResolverSettings,
    pub(crate) compile_bytecode: bool,
    pub(crate) reinstall: Reinstall,
}

impl ResolverInstallerSettings {
    /// Resolve the [`ResolverInstallerSettings`] from CLI, environment, and filesystem options.
    fn resolve(
        args: ResolverInstallerArgs,
        build: BuildOptionsArgs,
        filesystem: Option<FilesystemOptions>,
        environment: &EnvironmentOptions,
    ) -> Result<Self> {
        let args =
            resolver_installer_options(args, build, configured_indexes(filesystem.as_ref()))?;

        Ok(Self::combine(args, filesystem, environment))
    }

    /// Reconcile the [`ResolverInstallerSettings`] from the CLI and filesystem configuration.
    fn combine(
        args: ResolverInstallerOptions,
        filesystem: Option<FilesystemOptions>,
        environment: &EnvironmentOptions,
    ) -> Self {
        let options = resolver_installer_options_with_environment(args, environment).combine(
            ResolverInstallerOptions::from(
                filesystem
                    .map(FilesystemOptions::into_options)
                    .map(|options| options.top_level)
                    .unwrap_or_default(),
            ),
        );

        let base = Self::from(options);
        Self {
            resolver: ResolverSettings {
                cuda_driver_version: environment.cuda_driver_version.clone(),
                amd_gpu_architecture: environment.amd_gpu_architecture,
                ..base.resolver
            },
            ..base
        }
    }
}

fn resolver_installer_options_with_environment(
    mut options: ResolverInstallerOptions,
    environment: &EnvironmentOptions,
) -> ResolverInstallerOptions {
    options.no_binary_package = options
        .no_binary_package
        .or(environment.no_binary_package.clone());
    options.no_build_package = options
        .no_build_package
