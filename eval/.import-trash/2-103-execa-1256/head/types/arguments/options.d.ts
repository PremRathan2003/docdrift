
	When aborted, `error.isGracefullyCanceled` becomes `true`.

	@default false
	*/
	readonly gracefulCancel?: Unless<IsSync, boolean>;

	/**
	If the subprocess is terminated but does not exit, forcefully exit it by sending [`SIGKILL`](https://en.wikipedia.org/wiki/Signal_(IPC)#SIGKILL).

	When this happens, `error.isForcefullyTerminated` becomes `true`.

	@default 5000
	*/
	readonly forceKillAfterDelay?: Unless<IsSync, number | boolean>;

	/**
	Default [signal](https://en.wikipedia.org/wiki/Signal_(IPC)) used to terminate the subprocess.

	This can be either a name (like `'SIGTERM'`) or a number (like `9`).

	@default 'SIGTERM'
	*/
	readonly killSignal?: keyof SignalConstants | number;

	/**
	Run the subprocess independently from the current process.

	@default false
	*/
	readonly detached?: Unless<IsSync, boolean>;

	/**
	Kill the subprocess when the current process exits.

	@default true
	*/
	readonly cleanup?: Unless<IsSync, boolean>;

	/**
	When the subprocess is terminated by Execa, also terminate all of its descendant processes, instead of only the subprocess itself.

	This is useful when the subprocess spawns its own processes, such as when using the `shell` option.

	On Unix, this spawns the subprocess in its own [process group](https://en.wikipedia.org/wiki/Process_group). On Windows, this uses [`taskkill`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill).

	This is best-effort: descendant processes that create their own process group or session are not terminated.

	@default false
	*/
	readonly killDescendants?: Unless<IsSync, boolean>;

	/**
	Sets the [user identifier](https://en.wikipedia.org/wiki/User_identifier) of the subprocess.

	@default current user identifier
	*/
	readonly uid?: number;

	/**
	Sets the [group identifier](https://en.wikipedia.org/wiki/Group_identifier) of the subprocess.

	@default current group identifier
	*/
	readonly gid?: number;

	/**
	Value of [`argv[0]`](https://nodejs.org/api/process.html#processargv0) sent to the subprocess.

	@default file being executed
	*/
	readonly argv0?: string;

	/**
	On Windows, do not create a new console window.

	@default true
	*/
	readonly windowsHide?: boolean;

	/**
	If `false`, escapes the command arguments on Windows.

	@default `true` if the `shell` option is `true`, `false` otherwise
	*/
	readonly windowsVerbatimArguments?: boolean;
};

/**
Subprocess options.

Some options are related to the subprocess output: `verbose`, `lines`, `stripFinalNewline`, `buffer`, `maxBuffer`. By default, those options apply to all file descriptors (`stdout`, `stderr`, etc.). A plain object can be passed instead to apply them to only `stdout`, `stderr`, `all` (both stdout and stderr), `ipc`, `fd3`, etc.

