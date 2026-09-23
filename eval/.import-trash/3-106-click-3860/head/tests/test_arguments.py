    def cli(f):
        click.echo(f)

    result = runner.invoke(cli, [])
    assert result.exit_code == 0
    assert result.output == "test\n"


def test_argument_help(runner):
    @click.command()
    @click.argument("name", help="The name to print")
    @click.option("--count", default=1, help="number of greetings")
    def cli(name, count):
        pass

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0, result.output
    assert "Positional arguments:" in result.output
    assert "NAME" in result.output
    assert "The name to print" in result.output
    assert "Options:" in result.output
    assert "number of greetings" in result.output
    assert result.output.index("Positional arguments:") < result.output.index(
        "Options:"
    )


def test_argument_help_options_only_no_arguments_section(runner):
    @click.command()
    @click.option("--count", default=1, help="number of greetings")
    def cli(count):
        pass

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0, result.output
    assert "Positional arguments:" not in result.output
    assert "Options:" in result.output
    assert "number of greetings" in result.output


def test_argument_help_lists_undocumented_arguments(runner):
    """One documented argument makes the section list all of them."""

    @click.command()
    @click.argument("src", help="Source path")
    @click.argument("dst")
    @click.argument("extra", nargs=-1)
    def cli(src, dst, extra):
        pass

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0, result.output
    lines = result.output.splitlines()
    start = lines.index("Positional arguments:")
    assert lines[start : start + 4] == [
        "Positional arguments:",
        "  SRC         Source path",
        "  DST",
        "  [EXTRA]...",
    ]


def test_argument_help_undocumented_arguments_only_no_section(runner):
    """Arguments alone produce no section: at least one needs a help."""

    @click.command()
    @click.argument("src")
    @click.argument("dst")
    def cli(src, dst):
        pass

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0, result.output
    assert "Positional arguments:" not in result.output


def test_argument_help_deprecated_without_help_lists_all(runner):
    """A deprecation label counts as help and brings every argument into view."""

    @click.command()
    @click.argument("src", required=False, deprecated=True)
    @click.argument("dst")
    def cli(src, dst):
        pass

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0, result.output
    lines = result.output.splitlines()
    start = lines.index("Positional arguments:")
    assert lines[start : start + 3] == [
        "Positional arguments:",
        "  [SRC!]  (DEPRECATED)",
        "  DST",
    ]


def test_argument_help_empty_string_lists_all(runner):
    """An explicit empty help opens the section, the same way an empty option help
    keeps its option listed.
    """

    @click.command()
    @click.argument("src", help="")
    @click.argument("dst")
    def cli(src, dst):
        pass

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0, result.output
    lines = result.output.splitlines()
    start = lines.index("Positional arguments:")
    assert lines[start : start + 3] == [
        "Positional arguments:",
        "  SRC",
        "  DST",
    ]


@pytest.mark.parametrize(
    ("help_text", "expected"),
    [
        pytest.param(None, ("SRC", ""), id="None"),
        pytest.param("", ("SRC", ""), id="empty"),
        pytest.param("Source path", ("SRC", "Source path"), id="documented"),
    ],
)
def test_argument_get_help_record_never_none(help_text, expected):
    """Every argument gets a row, even an undocumented one."""
    arg = click.Argument(["src"], help=help_text)
    ctx = click.Context(click.Command("cli"))
    assert arg.get_help_record(ctx) == expected


def test_argument_help_optional_metavar(runner):
    @click.command()
    @click.argument("name", required=False, default="", help="The name to print")
    def cli(name):
        pass

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0, result.output
    assert "[NAME]" in result.output
    assert "The name to print" in result.output


def test_deprecated_usage(runner):
    @click.command()
    @click.argument("f", required=False, deprecated=True)
    def cli(f):
        click.echo(f)

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0, result.output
    assert "[F!]" in result.output


@pytest.mark.parametrize(
    ("kwargs", "expected"),
    [
        ({}, "FOO"),
        ({"required": True}, "FOO"),
        ({"required": False}, "[FOO]"),
        ({"default": "x"}, "[FOO]"),
        ({"nargs": -1}, "[FOO]..."),
        ({"nargs": -1, "required": True}, "FOO..."),
        ({"nargs": 2}, "FOO..."),
        ({"nargs": 2, "required": False}, "[FOO]..."),
    ],
)
def test_argument_metavar_marks_optional(runner, kwargs, expected):
    """An argument is bracketed in the usage line only when it is optional."""

    @click.command()
