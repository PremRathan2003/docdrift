  /**
   * Display the help or a custom message after an error occurs.
   */
  showHelpAfterError(displayHelp?: boolean | string): this;

  /**
   * Display suggestion of similar commands for unknown commands, or options for unknown options.
   */
  showSuggestionAfterError(displaySuggestion?: boolean): this;

  /**
   * Register callback `fn` for the command.
   *
   * @example
   * ```
   * program
   *   .command('serve')
   *   .description('start service')
   *   .action(function() {
   *     // do work here
   *   });
   * ```
   *
   * @returns `this` command for chaining
   */
  action(fn: (this: this, ...args: any[]) => void | Promise<void>): this;

  /**
   * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
   * option-argument is indicated by `<>` and an optional option-argument by `[]`.
   *
   * See the README for more details, and see also addOption() and requiredOption().
   *
   * @example
   *
   * ```js
   * program
   *     .option('-p, --pepper', 'add pepper')
   *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
   *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
   *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
   * ```
   *
   * @returns `this` command for chaining
   */
  option(
    flags: string,
    description?: string,
    defaultValue?: string | boolean | string[],
  ): this;
  option<T>(
    flags: string,
    description: string,
    parseArg: (value: string, previous: T) => T,
    defaultValue?: T,
  ): this;
  /** @deprecated since v7, instead use choices or a custom function */
  option(
    flags: string,
    description: string,
    regexp: RegExp,
    defaultValue?: string | boolean | string[],
  ): this;

  /**
   * Define a required option, which must have a value after parsing. This usually means
   * the option must be specified on the command line. (Otherwise the same as .option().)
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
   */
  requiredOption(
    flags: string,
    description?: string,
    defaultValue?: string | boolean | string[],
  ): this;
  requiredOption<T>(
    flags: string,
    description: string,
    parseArg: (value: string, previous: T) => T,
