        -   :meth:`format_options`
        -   :meth:`format_epilog`
        """
        self.format_usage(ctx, formatter)
        self.format_help_text(ctx, formatter)
        self.format_arguments(ctx, formatter)
        self.format_options(ctx, formatter)
        self.format_epilog(ctx, formatter)

    def format_help_text(self, ctx: Context, formatter: HelpFormatter) -> None:
        """Writes the help text to the formatter if it exists."""
        if self.help is not None:
            # truncate the help text to the first form feed
            text = inspect.cleandoc(self.help).partition("\f")[0]
        else:
            text = ""

        if self.deprecated:
            label = _format_deprecated_label(self.deprecated)
            text = f"{_(text)} {label}" if text else label

        if text:
            formatter.write_paragraph()

            with formatter.indentation():
                formatter.write_text(text)

    def format_options(self, ctx: Context, formatter: HelpFormatter) -> None:
        """Writes all the options into the formatter if they exist."""
        opts = []
        for param in self.get_params(ctx):
            rv = param.get_help_record(ctx)
            if rv is not None and not isinstance(param, Argument):
                opts.append(rv)

        if opts:
            with formatter.section(_("Options")):
                formatter.write_dl(opts)

    def format_arguments(self, ctx: Context, formatter: HelpFormatter) -> None:
        """Writes all arguments into the formatter, if at least one is documented.

        An argument with no help gets an empty description, the same way an option
        with no help does. That keeps the section an exhaustive list of the
        positional arguments, matching the usage line.
        """
        args = [param for param in self.get_params(ctx) if isinstance(param, Argument)]

        if any(arg.help is not None for arg in args):
            with formatter.section(_("Positional arguments")):
                formatter.write_dl([arg.get_help_record(ctx) for arg in args])

    def format_epilog(self, ctx: Context, formatter: HelpFormatter) -> None:
        """Writes the epilog into the formatter if it exists."""
        if self.epilog:
            epilog = inspect.cleandoc(self.epilog)
            formatter.write_paragraph()

            with formatter.indentation():
                formatter.write_text(epilog)

    def make_context(
        self,
        info_name: str | None,
        args: list[str],
        parent: Context | None = None,
        **extra: t.Any,
    ) -> Context:
        """This function when given an info name and arguments will kick
        off the parsing and create a new :class:`Context`.  It does not
        invoke the actual command callback though.

        To quickly customize the context class used without overriding
        this method, set the :attr:`context_class` attribute.

        :param info_name: the info name for this invocation.  Generally this
                          is the most descriptive name for the script or
                          command.  For the toplevel script it's usually
                          the name of the script, for commands below it's
                          the name of the command.
        :param args: the arguments to parse as list of strings.
        :param parent: the parent context if available.
        :param extra: extra keyword arguments forwarded to the context
                      constructor.

        .. versionchanged:: 8.0
            Added the :attr:`context_class` attribute.
        """
        for key, value in self.context_settings.items():
            if key not in extra:
                extra[key] = value
… trimmed for the evaluation dataset …
        if self.metavar is not None:
            return self.metavar
        var = self.type.get_metavar(param=self, ctx=ctx)
        if not var:
            var = self.name.upper()
        # Types like ``Choice`` and ``DateTime`` already surround their metavar
        # with square brackets to enumerate the allowed values. Reuse those
        # outer brackets as the optional-argument indicator instead of wrapping
        # the metavar in a second pair, which would produce ``[[a|b|c]]``.
        already_bracketed = var.startswith("[") and var.endswith("]")
        if self.deprecated:
            var += "!"
        if not self.required and not already_bracketed:
            var = f"[{var}]"
        if self.nargs != 1:
            var += "..."
        return var

    def _parse_decls(
        self, decls: cabc.Sequence[str], expose_value: bool
    ) -> tuple[str, list[str], list[str]]:
        if not decls:
            if not expose_value:
                return "", [], []
            raise TypeError("Argument is marked as exposed, but does not have a name.")
        if len(decls) == 1:
            name = arg = decls[0]
            name = name.replace("-", "_").lower()
        else:
            raise TypeError(
                _(
                    "Arguments take exactly one parameter declaration, got"
                    " {length}: {decls}."
                ).format(length=len(decls), decls=decls)
            )
        return name, [arg], []

    def get_usage_pieces(self, ctx: Context) -> list[str]:
        return [self.make_metavar(ctx)]

    def get_help_record(self, ctx: Context) -> tuple[str, str]:
        """Returns the argument's help row: its metavar and its help text.

        Unlike :meth:`Option.get_help_record`, this never returns ``None``. An
        argument cannot be hidden, so an undocumented one still gets a row, with
        an empty description.

        .. versionchanged:: 8.5.1
            Always returns a tuple. It used to return ``None`` when ``help`` was
            not set.
        """
        return self.make_metavar(ctx), self.help or ""

    def get_error_hint(self, ctx: Context | None) -> str:
        if ctx is not None:
            return f"'{self.make_metavar(ctx)}'"
        return f"'{self.human_readable_name}'"

    def add_to_parser(self, parser: _OptionParser, ctx: Context) -> None:
        parser.add_argument(dest=self.name, nargs=self.nargs, obj=self)


def __getattr__(name: str) -> object:
    import warnings

    if name == "BaseCommand":
        warnings.warn(
            "'BaseCommand' is deprecated and will be removed in Click 9.0. Use"
            " 'Command' instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        return _BaseCommand

    if name == "MultiCommand":
        warnings.warn(
            "'MultiCommand' is deprecated and will be removed in Click 9.0. Use"
            " 'Group' instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        return _MultiCommand

    raise AttributeError(name)
