
def _complete_visible_commands(
    ctx: Context, incomplete: str
) -> cabc.Iterator[tuple[str, Command]]:
    """List all the subcommands of a group that start with the
    incomplete value and aren't hidden.

    :param ctx: Invocation context for the group.
    :param incomplete: Value being completed. May be empty.
    """
    multi = t.cast(Group, ctx.command)

    for name in multi.list_commands(ctx):
        if name.startswith(incomplete):
            command = multi.get_command(ctx, name)

            if command is not None and not command.hidden:
                yield name, command


def _check_nested_chain(
    base_command: Group, cmd_name: str, cmd: Command, register: bool = False
) -> None:
    if not base_command.chain or not isinstance(cmd, Group):
        return

    if register:
        message = (
            f"It is not possible to add the group {cmd_name!r} to another"
            f" group {base_command.name!r} that is in chain mode."
        )
    else:
        message = (
            f"Found the group {cmd_name!r} as subcommand to another group "
            f" {base_command.name!r} that is in chain mode. This is not supported."
        )

    raise RuntimeError(message)


def _echo_aborted() -> None:
    """Write the final abort message to standard error."""
    echo(_("Aborted!"), file=sys.stderr)


def _format_deprecated_label(deprecated: bool | str) -> str:
    """Return the parenthesized deprecation label shown in help text."""
    label = _("deprecated").upper()
    if isinstance(deprecated, str):
        return f"({label}: {deprecated})"
    return f"({label})"


def _format_deprecated_suffix(deprecated: bool | str) -> str:
    """Return the trailing reason for a ``DeprecationWarning`` message,
    prefixed with a space, or an empty string when no reason was given.
    """
    if isinstance(deprecated, str):
        return f" {deprecated}"
    return ""


def batch(iterable: cabc.Iterable[V], batch_size: int) -> list[tuple[V, ...]]:
    return list(zip(*repeat(iter(iterable), batch_size), strict=False))


@contextmanager
def augment_usage_errors(
    ctx: Context, param: Parameter | None = None
) -> cabc.Generator[None]:
    """Context manager that attaches extra information to exceptions."""
    try:
        yield
    except BadParameter as e:
        if e.ctx is None:
            e.ctx = ctx
        if param is not None and e.param is None:
            e.param = param
        raise
    except UsageError as e:
        if e.ctx is None:
            e.ctx = ctx
        raise


… trimmed for the evaluation dataset …
                             uppercase.
        :param standalone_mode: the default behavior is to invoke the script
                                in standalone mode.  Click will then
                                handle exceptions and convert them into
                                error messages and the function will never
                                return but shut down the interpreter.  If
                                this is set to `False` they will be
                                propagated to the caller and the return
                                value of this function is the return value
                                of :meth:`invoke`.
        :param windows_expand_args: Expand glob patterns, user dir, and
            env vars in command line args on Windows.
        :param extra: extra keyword arguments are forwarded to the context
                      constructor.  See :class:`Context` for more information.

        .. versionchanged:: 8.0.1
            Added the ``windows_expand_args`` parameter to allow
            disabling command line arg expansion on Windows.

        .. versionchanged:: 8.0
            When taking arguments from ``sys.argv`` on Windows, glob
            patterns, user dir, and env vars are expanded.

        .. versionchanged:: 3.0
           Added the ``standalone_mode`` parameter.
        """
        if args is None:
            args = sys.argv[1:]

            if os.name == "nt" and windows_expand_args:
                args = _expand_args(args)
        else:
            args = list(args)

        if prog_name is None:
            prog_name = _detect_program_name()

        # Process shell completion requests and exit early.
        self._main_shell_completion(extra, prog_name, complete_var)

        # Every handler below takes the same two steps: propagate when
        # standalone mode is disabled, otherwise collect the message and the
        # exit code, and leave both to the teardown after the ``try``. The
        # teardown writes the message and exits, and the outermost handler
        # holds one policy for every interrupt arriving that late: the
        # message may be lost, the intended exit code still wins.
        report: cabc.Callable[[], None] | None = None
        exit_code = 1

        try:
            try:
                with self.make_context(prog_name, args, **extra) as ctx:
                    rv = self.invoke(ctx)
                    if not standalone_mode:
                        return rv
                    # it's not safe to `ctx.exit(rv)` here!
                    # note that `rv` may actually contain data like "1" which
                    # has obvious effects
                    # more subtle case: `rv=[None, None]` can come out of
                    # chained commands which all returned `None` -- so it's not
                    # even always obvious that `rv` indicates success/failure
                    # by its truthiness/falsiness
                    ctx.exit()
            except Exit as e:
                if not standalone_mode:
                    # in non-standalone mode, return the exit code
                    # note that this is only reached if `self.invoke` above raises
                    # an Exit explicitly -- thus bypassing the check there which
                    # would return its result
                    # the results of non-standalone execution may therefore be
                    # somewhat ambiguous: if there are codepaths which lead to
                    # `ctx.exit(1)` and to `return 1`, the caller won't be able to
                    # tell the difference between the two
                    return e.exit_code

                exit_code = e.exit_code
            except Abort:
                if not standalone_mode:
                    raise

                report = _echo_aborted
            except (EOFError, KeyboardInterrupt) as e:
                # The blank line closes the terminal's ``^C`` echo.
                echo(file=sys.stderr)

                if not standalone_mode:
                    raise Abort() from e

                report = _echo_aborted
            except ClickException as e:
                if not standalone_mode:
                    raise

                report, exit_code = e.show, e.exit_code
            except OSError as e:
                if e.errno != errno.EPIPE:
                    raise

                sys.stdout = t.cast(t.TextIO, _PacifyFlushWrapper(sys.stdout))
                sys.stderr = t.cast(t.TextIO, _PacifyFlushWrapper(sys.stderr))

            if report is not None:
                report()

            sys.exit(exit_code)
        except (EOFError, KeyboardInterrupt):
            if not standalone_mode:
                raise

            sys.exit(exit_code)

    def _main_shell_completion(
        self,
        ctx_args: cabc.MutableMapping[str, t.Any],
        prog_name: str,
        complete_var: str | None = None,
    ) -> None:
        """Check if the shell is asking for tab completion, process
        that, then exit early. Called from :meth:`main` before the
        program is invoked.

        :param prog_name: Name of the executable in the shell.
        :param complete_var: Name of the environment variable that holds
            the completion instruction. Defaults to
            ``_{PROG_NAME}_COMPLETE``.

        .. versionchanged:: 8.2.0
            Dots (``.``) in ``prog_name`` are replaced with underscores (``_``).
        """
        if complete_var is None:
            complete_name = prog_name.replace("-", "_").replace(".", "_")
            complete_var = f"_{complete_name}_COMPLETE".upper()

        instruction = os.environ.get(complete_var)

        if not instruction:
            return

        from .shell_completion import shell_complete

        rv = shell_complete(self, ctx_args, prog_name, complete_var, instruction)
        sys.exit(rv)

    def __call__(self, *args: t.Any, **kwargs: t.Any) -> t.Any:
        """Alias for :meth:`main`."""
        return self.main(*args, **kwargs)


class _FakeSubclassCheck(type):
    def __subclasscheck__(cls, subclass: type) -> bool:
        return issubclass(subclass, cls.__bases__[0])
