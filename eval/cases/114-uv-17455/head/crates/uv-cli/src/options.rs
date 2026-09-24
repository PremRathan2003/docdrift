use std::env;
use std::error::Error;
use std::fmt;

use anyhow::bail;

use uv_cache::Refresh;
use uv_configuration::{BuildIsolation, Reinstall, Upgrade};
use uv_distribution_types::{ConfigSettings, Index, PackageConfigSettings, Requirement};
use uv_resolver::{ExcludeNewerPackage, PrereleaseMode, PrereleasePackage};
use uv_settings::{
    Combine, EnvFlag, IndexOptions, PipOptions, ResolverInstallerOptions, ResolverOptions,
};
use uv_warnings::owo_colors::OwoColorize;

use crate::{
    BuildIsolationArgs, BuildOptionsArgs, CompileBytecodeArgs, ExcludeNewerArgs, FetchArgs,
    IndexArgs, InstallerArgs, Maybe, PackageBuildIsolationArgs, PackageExcludeNewerArgs,
    RefreshArgs, RegistryClientArgs, ReinstallArgs, ResolverArgs, ResolverInstallerArgs,
    SourcesArgs, VersionSelectionArgs,
};

/// An error caused by an invalid combination of command-line arguments.
#[derive(Debug)]
pub struct ArgumentError(String);

impl fmt::Display for ArgumentError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl Error for ArgumentError {}

/// Given a boolean flag pair (like `--upgrade` and `--no-upgrade`), resolve the value of the flag.
pub fn flag(yes: bool, no: bool, name: &str) -> anyhow::Result<Option<bool>> {
    debug_assert!(
        !name.starts_with("no-"),
        "flag names must not include the `no-` prefix"
    );

    match (yes, no) {
        (true, false) => Ok(Some(true)),
        (false, true) => Ok(Some(false)),
        (false, false) => Ok(None),
        (..) => {
            bail!(ArgumentError(format!(
                "`{}` and `{}` cannot be used together. \
                Boolean flags on different levels are currently not supported \
… trimmed for the evaluation dataset …
            name: name_b,
        },
    ) = (flag_a, flag_b)
    {
        let display_a = match source_a {
            FlagSource::Cli => format!("`--{name_a}`"),
            FlagSource::Env(env) => format!("`{env}` (environment variable)"),
            FlagSource::Config => format!("`{name_a}` (workspace configuration)"),
        };
        let display_b = match source_b {
            FlagSource::Cli => format!("`--{name_b}`"),
            FlagSource::Env(env) => format!("`{env}` (environment variable)"),
            FlagSource::Config => format!("`{name_b}` (workspace configuration)"),
        };
        bail!(ArgumentError(format!(
            "the argument {} cannot be used with {}",
            display_a.green(),
            display_b.green()
        )));
    }
    Ok(())
}

impl TryFrom<RefreshArgs> for Refresh {
    type Error = anyhow::Error;

    fn try_from(value: RefreshArgs) -> anyhow::Result<Self> {
        let RefreshArgs {
            refresh,
            no_refresh,
            refresh_package,
        } = value;

        Ok(Self::from_args(
            flag(refresh, no_refresh, "refresh")?,
            refresh_package,
        ))
    }
}

/// Convert command-line arguments into [`PipOptions`].
pub trait IntoPipOptions {
    /// Convert command-line arguments into pip options using the effective configuration.
    fn into_pip_options(self, configured_indexes: &[Index]) -> anyhow::Result<PipOptions>;
}

impl IntoPipOptions for ResolverArgs {
    /// Convert resolver arguments into pip options using the effective configuration.
    fn into_pip_options(self, configured_indexes: &[Index]) -> anyhow::Result<PipOptions> {
        let Self {
            index_args,
            upgrade,
            no_upgrade,
            upgrade_package,
            upgrade_group,
            registry_client:
                RegistryClientArgs {
                    index_strategy,
                    keyring_provider,
                },
            version_selection:
                VersionSelectionArgs {
                    resolution,
                    prerelease,
                    prerelease_package,
                    pre,
                    fork_strategy,
                },
            config_setting,
            config_settings_package,
            build_isolation:
                PackageBuildIsolationArgs {
                    build_isolation:
                        BuildIsolationArgs {
                            no_build_isolation,
                            build_isolation,
                        },
                    no_build_isolation_package,
                },
            exclude_newer:
                PackageExcludeNewerArgs {
                    exclude_newer: ExcludeNewerArgs { exclude_newer },
                    exclude_newer_package,
                },
            link_mode,
            sources:
                SourcesArgs {
                    no_sources,
                    no_sources_package,
                },
        } = self;

        if !upgrade_group.is_empty() {
            bail!(ArgumentError(format!(
                "`{}` is not supported in `uv pip` commands",
                "--upgrade-group".green()
            )));
        }

        Ok(PipOptions {
            upgrade: flag(upgrade, no_upgrade, "upgrade")?,
            upgrade_package: Some(upgrade_package),
            index_strategy,
            keyring_provider,
            resolution,
            fork_strategy,
            prerelease: if pre {
                Some(PrereleaseMode::Allow)
            } else {
                prerelease
            },
            prerelease_package: prerelease_package.map(PrereleasePackage::from_iter),
            config_settings: config_setting
                .map(|config_settings| config_settings.into_iter().collect::<ConfigSettings>()),
            config_settings_package: config_settings_package.map(|config_settings| {
                config_settings
                    .into_iter()
                    .collect::<PackageConfigSettings>()
            }),
            no_build_isolation: flag(no_build_isolation, build_isolation, "build-isolation")?,
            no_build_isolation_package: Some(no_build_isolation_package),
            exclude_newer,
            exclude_newer_package: exclude_newer_package.map(ExcludeNewerPackage::from_iter),
            link_mode,
            no_sources: if no_sources { Some(true) } else { None },
            no_sources_package: if no_sources_package.is_empty() {
                None
            } else {
                Some(no_sources_package)
            },
            ..index_args.into_pip_options(configured_indexes)?
        })
    }
}

impl IntoPipOptions for InstallerArgs {
    /// Convert installer arguments into pip options using the effective configuration.
    fn into_pip_options(self, configured_indexes: &[Index]) -> anyhow::Result<PipOptions> {
        let Self {
            index_args,
            reinstall:
                ReinstallArgs {
                    reinstall,
                    no_reinstall,
                    reinstall_package,
                },
            registry_client:
                RegistryClientArgs {
                    index_strategy,
                    keyring_provider,
                },
            config_setting,
            config_settings_package,
            build_isolation:
                BuildIsolationArgs {
                    no_build_isolation,
                    build_isolation,
                },
            exclude_newer:
                PackageExcludeNewerArgs {
                    exclude_newer: ExcludeNewerArgs { exclude_newer },
                    exclude_newer_package,
                },
            link_mode,
            compile_bytecode:
                CompileBytecodeArgs {
                    compile_bytecode,
                    no_compile_bytecode,
                },
            sources:
                SourcesArgs {
                    no_sources,
                    no_sources_package,
                },
        } = self;

        Ok(PipOptions {
            reinstall: flag(reinstall, no_reinstall, "reinstall")?,
            reinstall_package: Some(reinstall_package),
            index_strategy,
            keyring_provider,
            config_settings: config_setting
                .map(|config_settings| config_settings.into_iter().collect::<ConfigSettings>()),
            config_settings_package: config_settings_package.map(|config_settings| {
                config_settings
                    .into_iter()
                    .collect::<PackageConfigSettings>()
            }),
            no_build_isolation: flag(no_build_isolation, build_isolation, "build-isolation")?,
            exclude_newer,
            exclude_newer_package: exclude_newer_package.map(ExcludeNewerPackage::from_iter),
            link_mode,
            compile_bytecode: flag(compile_bytecode, no_compile_bytecode, "compile-bytecode")?,
            no_sources: if no_sources { Some(true) } else { None },
            no_sources_package: if no_sources_package.is_empty() {
                None
            } else {
                Some(no_sources_package)
            },
            ..index_args.into_pip_options(configured_indexes)?
        })
    }
}

impl IntoPipOptions for ResolverInstallerArgs {
    /// Convert resolver and installer arguments into pip options using the effective configuration.
    fn into_pip_options(self, configured_indexes: &[Index]) -> anyhow::Result<PipOptions> {
        let Self {
            index_args,
            upgrade,
            no_upgrade,
            upgrade_package,
            upgrade_group,
            reinstall:
                ReinstallArgs {
                    reinstall,
                    no_reinstall,
                    reinstall_package,
                },
            registry_client:
                RegistryClientArgs {
                    index_strategy,
                    keyring_provider,
                },
            version_selection:
                VersionSelectionArgs {
                    resolution,
                    prerelease,
                    prerelease_package,
                    pre,
                    fork_strategy,
                },
            config_setting,
            config_settings_package,
            build_isolation:
                PackageBuildIsolationArgs {
                    build_isolation:
                        BuildIsolationArgs {
                            no_build_isolation,
                            build_isolation,
                        },
                    no_build_isolation_package,
                },
            exclude_newer:
                PackageExcludeNewerArgs {
                    exclude_newer: ExcludeNewerArgs { exclude_newer },
                    exclude_newer_package,
                },
            link_mode,
            compile_bytecode:
                CompileBytecodeArgs {
                    compile_bytecode,
                    no_compile_bytecode,
                },
            sources:
                SourcesArgs {
                    no_sources,
                    no_sources_package,
                },
        } = self;

        if !upgrade_group.is_empty() {
            bail!(ArgumentError(format!(
                "`{}` is not supported in `uv pip` commands",
                "--upgrade-group".green()
            )));
        }

        Ok(PipOptions {
            upgrade: flag(upgrade, no_upgrade, "upgrade")?,
            upgrade_package: Some(upgrade_package),
            reinstall: flag(reinstall, no_reinstall, "reinstall")?,
            reinstall_package: Some(reinstall_package),
            index_strategy,
            keyring_provider,
            resolution,
            prerelease: if pre {
                Some(PrereleaseMode::Allow)
            } else {
                prerelease
            },
            prerelease_package: prerelease_package.map(PrereleasePackage::from_iter),
            fork_strategy,
            config_settings: config_setting
                .map(|config_settings| config_settings.into_iter().collect::<ConfigSettings>()),
            config_settings_package: config_settings_package.map(|config_settings| {
                config_settings
                    .into_iter()
                    .collect::<PackageConfigSettings>()
            }),
            no_build_isolation: flag(no_build_isolation, build_isolation, "build-isolation")?,
            no_build_isolation_package: Some(no_build_isolation_package),
            exclude_newer,
            exclude_newer_package: exclude_newer_package.map(ExcludeNewerPackage::from_iter),
            link_mode,
            compile_bytecode: flag(compile_bytecode, no_compile_bytecode, "compile-bytecode")?,
            no_sources: if no_sources { Some(true) } else { None },
            no_sources_package: if no_sources_package.is_empty() {
                None
            } else {
                Some(no_sources_package)
            },
            ..index_args.into_pip_options(configured_indexes)?
        })
    }
}

impl IntoPipOptions for FetchArgs {
    /// Convert package-fetch arguments into pip options using the effective configuration.
    fn into_pip_options(self, configured_indexes: &[Index]) -> anyhow::Result<PipOptions> {
        let Self {
            index_args,
            registry_client:
                RegistryClientArgs {
                    index_strategy,
                    keyring_provider,
                },
            exclude_newer:
                PackageExcludeNewerArgs {
                    exclude_newer: ExcludeNewerArgs { exclude_newer },
                    exclude_newer_package,
                },
        } = self;

        Ok(PipOptions {
            index_strategy,
            keyring_provider,
            exclude_newer,
            exclude_newer_package: exclude_newer_package.map(ExcludeNewerPackage::from_iter),
            ..index_args.into_pip_options(configured_indexes)?
        })
    }
}

impl IndexArgs {
    /// Resolve the index arguments shared by pip, resolver, and installer settings.
    fn resolve(self, configured_indexes: &[Index]) -> anyhow::Result<IndexOptions> {
        let Self {
            default_index,
            index,
            index_url,
            extra_index_url,
            no_index,
            find_links,
        } = self;

        let default_index = default_index
            .and_then(Maybe::into_option)
            .map(|index| index.resolve(configured_indexes))
            .transpose()?
            .map(|index| vec![index]);
        let index = index
            .map(|indexes| {
                indexes
                    .into_iter()
                    .flatten()
                    .filter_map(Maybe::into_option)
                    .map(|index| index.resolve(configured_indexes))
                    .collect::<anyhow::Result<Vec<_>>>()
            })
            .transpose()?;

        Ok(IndexOptions {
            index: default_index.combine(index),
            index_url: index_url.and_then(Maybe::into_option),
            extra_index_url: extra_index_url
                .map(|indexes| indexes.into_iter().filter_map(Maybe::into_option).collect()),
            no_index: no_index.then_some(true),
            find_links: find_links
                .map(|links| links.into_iter().filter_map(Maybe::into_option).collect()),
        })
    }
}

impl IntoPipOptions for IndexArgs {
    /// Convert index arguments into pip options, resolving configured index names.
    fn into_pip_options(self, configured_indexes: &[Index]) -> anyhow::Result<PipOptions> {
        Ok(PipOptions::from(
            self.resolve(configured_indexes)?
                .relative_to(&env::current_dir()?)?,
        ))
    }
}

/// Construct the [`ResolverOptions`] from the [`ResolverArgs`] and [`BuildOptionsArgs`].
pub fn resolver_options(
    resolver_args: ResolverArgs,
    build_args: BuildOptionsArgs,
    configured_indexes: &[Index],
) -> anyhow::Result<ResolverOptions> {
    let ResolverArgs {
        index_args,
        upgrade,
        no_upgrade,
        upgrade_package,
        upgrade_group,
        registry_client:
            RegistryClientArgs {
                index_strategy,
                keyring_provider,
            },
        version_selection:
            VersionSelectionArgs {
                resolution,
                prerelease,
                prerelease_package,
                pre,
                fork_strategy,
            },
        config_setting,
        config_settings_package,
        build_isolation:
            PackageBuildIsolationArgs {
                build_isolation:
                    BuildIsolationArgs {
                        no_build_isolation,
                        build_isolation,
                    },
                no_build_isolation_package,
            },
        exclude_newer:
            PackageExcludeNewerArgs {
                exclude_newer: ExcludeNewerArgs { exclude_newer },
                exclude_newer_package,
            },
        link_mode,
        sources: SourcesArgs {
            no_sources,
            no_sources_package,
        },
    } = resolver_args;

    let BuildOptionsArgs {
        no_build,
        build,
        no_build_package,
        no_binary,
        binary,
        no_binary_package,
    } = build_args;

    ResolverOptions {
        indexes: index_args.resolve(configured_indexes)?,
        upgrade: Upgrade::from_args(
            flag(upgrade, no_upgrade, "upgrade")?,
            upgrade_package.into_iter().map(Requirement::from).collect(),
            upgrade_group,
        ),
        index_strategy,
        keyring_provider,
        resolution,
        prerelease: if pre {
            Some(PrereleaseMode::Allow)
        } else {
            prerelease
        },
        prerelease_package: prerelease_package.map(PrereleasePackage::from_iter),
        fork_strategy,
        dependency_metadata: None,
        config_settings: config_setting
            .map(|config_settings| config_settings.into_iter().collect::<ConfigSettings>()),
        config_settings_package: config_settings_package.map(|config_settings| {
            config_settings
                .into_iter()
                .collect::<PackageConfigSettings>()
        }),
        build_isolation: BuildIsolation::from_args(
            flag(no_build_isolation, build_isolation, "build-isolation")?,
            no_build_isolation_package,
        ),
        extra_build_dependencies: None,
        extra_build_variables: None,
        exclude_newer,
        exclude_newer_package: exclude_newer_package.map(ExcludeNewerPackage::from_iter),
        link_mode,
        torch_backend: None,
        no_build: flag(no_build, build, "build")?,
        no_build_package: if no_build_package.is_empty() {
            None
        } else {
            Some(no_build_package)
        },
        no_binary: flag(no_binary, binary, "binary")?,
        no_binary_package: if no_binary_package.is_empty() {
            None
        } else {
            Some(no_binary_package)
        },
        no_sources: if no_sources { Some(true) } else { None },
        no_sources_package: if no_sources_package.is_empty() {
            None
        } else {
            Some(no_sources_package)
        },
    }
    .relative_to(&env::current_dir()?)
    .map_err(Into::into)
}

/// Construct the [`ResolverInstallerOptions`] from the [`ResolverInstallerArgs`] and [`BuildOptionsArgs`].
pub fn resolver_installer_options(
    resolver_installer_args: ResolverInstallerArgs,
    build_args: BuildOptionsArgs,
    configured_indexes: &[Index],
) -> anyhow::Result<ResolverInstallerOptions> {
    let ResolverInstallerArgs {
        index_args,
        upgrade,
        no_upgrade,
        upgrade_package,
        upgrade_group,
        reinstall:
            ReinstallArgs {
                reinstall,
                no_reinstall,
                reinstall_package,
            },
        registry_client:
            RegistryClientArgs {
                index_strategy,
                keyring_provider,
            },
        version_selection:
            VersionSelectionArgs {
                resolution,
                prerelease,
                prerelease_package,
                pre,
                fork_strategy,
            },
        config_setting,
        config_settings_package,
        build_isolation:
            PackageBuildIsolationArgs {
                build_isolation:
                    BuildIsolationArgs {
                        no_build_isolation,
                        build_isolation,
                    },
                no_build_isolation_package,
            },
        exclude_newer:
            PackageExcludeNewerArgs {
                exclude_newer: ExcludeNewerArgs { exclude_newer },
                exclude_newer_package,
            },
        link_mode,
        compile_bytecode:
            CompileBytecodeArgs {
                compile_bytecode,
                no_compile_bytecode,
            },
        sources: SourcesArgs {
            no_sources,
            no_sources_package,
        },
    } = resolver_installer_args;

    let BuildOptionsArgs {
        no_build,
        build,
        no_build_package,
        no_binary,
        binary,
        no_binary_package,
    } = build_args;

    ResolverInstallerOptions {
        indexes: index_args.resolve(configured_indexes)?,
        upgrade: Upgrade::from_args(
            flag(upgrade, no_upgrade, "upgrade")?,
            upgrade_package.into_iter().map(Requirement::from).collect(),
            upgrade_group,
        ),
        reinstall: Reinstall::from_args(
            flag(reinstall, no_reinstall, "reinstall")?,
            reinstall_package,
        ),
        index_strategy,
        keyring_provider,
        resolution,
        prerelease: if pre {
            Some(PrereleaseMode::Allow)
        } else {
            prerelease
        },
        prerelease_package: prerelease_package.map(PrereleasePackage::from_iter),
        fork_strategy,
        dependency_metadata: None,
        config_settings: config_setting
            .map(|config_settings| config_settings.into_iter().collect::<ConfigSettings>()),
        config_settings_package: config_settings_package.map(|config_settings| {
            config_settings
                .into_iter()
                .collect::<PackageConfigSettings>()
        }),
        build_isolation: BuildIsolation::from_args(
            flag(no_build_isolation, build_isolation, "build-isolation")?,
            no_build_isolation_package,
        ),
        extra_build_dependencies: None,
        extra_build_variables: None,
        exclude_newer,
        exclude_newer_package: exclude_newer_package.map(ExcludeNewerPackage::from_iter),
        link_mode,
        compile_bytecode: flag(compile_bytecode, no_compile_bytecode, "compile-bytecode")?,
        no_build: flag(no_build, build, "build")?,
        no_build_package: if no_build_package.is_empty() {
            None
