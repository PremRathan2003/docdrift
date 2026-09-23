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
