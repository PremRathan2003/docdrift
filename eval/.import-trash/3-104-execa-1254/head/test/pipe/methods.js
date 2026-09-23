
const cleanupSubprocesses = async (...subprocesses) => {
	for (const subprocess of subprocesses) {
		subprocess.kill();
	}

	await Promise.allSettled(subprocesses);
};

const getPipeMessages = async piped => {
	const messages = [];
	for await (const message of piped.getEachMessage()) {
		messages.push(message);
	}

	return messages;
};

test('The .pipe() return value can be iterated', async t => {
	const lines = [];
	for await (const line of pipeSimple()) {
		lines.push(line);
	}

	t.deepEqual(lines, noNewlinesChunks);
});

test('The .pipe() return value has an .iterable() method', async t => {
	const lines = [];
	for await (const line of pipeSimple().iterable()) {
		lines.push(line);
	}

	t.deepEqual(lines, noNewlinesChunks);
});

test('The .pipe() return value has a .readable() method', async t => {
	t.is(await text(pipeSimple().readable()), simpleFull);
});

test('The .pipe() return value has a .readableStream() method', async t => {
	t.is(await text(pipeSimple().readableStream()), simpleFull);
});

test('The .pipe() return value .readable() can be called multiple times', async t => {
	const piped = pipeSimple();
	const [output, secondOutput] = await Promise.all([
		text(piped.readable()),
		text(piped.readable()),
	]);

	t.is(output, simpleFull);
	t.is(secondOutput, simpleFull);
});

test('The .pipe() return value .readable() keeps conversion options', async t => {
	const chunks = [];
	for await (const chunk of pipeSimple().readable({binary: false, preserveNewlines: false})) {
		chunks.push(chunk);
	}

	t.deepEqual(chunks, noNewlinesChunks);
	t.is(chunks.join(''), noNewlinesFull);
});

test('The .pipe() return value does not have a .writable() method', async t => {
	const piped = pipeSimple();
	t.is(piped.writable, undefined);
	t.is(piped.duplex, undefined);
	t.is(piped.writableStream, undefined);
	t.is(piped.transformStream, undefined);
	await piped;
});

test('The .pipe() return value does not have .all unless destination uses the "all" option', async t => {
	const piped = pipeSimple();
	const descriptor = Object.getOwnPropertyDescriptor(piped, 'all');

	t.is(piped.all, undefined);
	t.is(descriptor.value, undefined);
	t.is(descriptor.get, undefined);
	await piped;
});

test('The .pipe() return value has an .all property', async t => {
	const piped = pipeAll();
	t.true(piped.all instanceof Readable);
	t.is(await text(piped.all), simpleFull);
	await piped;
});

test('The .pipe() return value .all is created lazily and cached', async t => {
	const piped = pipeAll();
	const descriptor = Object.getOwnPropertyDescriptor(piped, 'all');

	t.is(typeof descriptor.get, 'function');
	const {all} = piped;
	t.true(all instanceof Readable);
	t.is(piped.all, all);
	t.is(Object.getOwnPropertyDescriptor(piped, 'all').get, undefined);
	t.is(await text(all), simpleFull);
	await piped;
});

test('The .pipe() return value .readable() can read destination stderr', async t => {
	const piped = pipeDistinctBoth();

	t.is(await text(piped.readable({from: 'stderr'})), `${simpleFull}:stderr`);
	await piped;
});

… trimmed for the evaluation dataset …
	destination.kill();
	await Promise.allSettled([source, destination, piped]);
});

test('The .pipe() return value can exchange IPC messages', async t => {
	const piped = execa('empty.js').pipe('ipc-echo.js', {ipc: true});
	await piped.sendMessage(foobarString);
	t.is(await piped.getOneMessage(), foobarString);
	await piped;
});

test('A chained .pipe() return value can be iterated', async t => {
	const lines = [];
	for await (const line of execa('noop-fd.js', ['1', simpleFull]).pipe('stdin.js').pipe('stdin.js')) {
		lines.push(line);
	}

	t.deepEqual(lines, noNewlinesChunks);
});

test('The .pipe() return value still awaits both subprocesses', async t => {
	await t.throwsAsync(execa('fail.js').pipe('stdin.js'), {message: /Command failed with exit code 2/});
});

test('The .pipe() return value iteration waits for source failure', async t => {
	const piped = execa('fail.js').pipe('stdin.js');

	await t.throwsAsync(async () => {
		for await (const line of piped) {
			t.fail(`Unexpected line: ${line}`);
		}
	}, {message: /Command failed with exit code 2/});
});

test('The .pipe() return value .readable() waits for source failure', async t => {
	const piped = execa('fail.js').pipe('stdin.js');

	await t.throwsAsync(text(piped.readable()), {message: /Command failed with exit code 2/});
});

test('The .pipe() return value .readableStream() waits for source failure', async t => {
	const piped = execa('fail.js').pipe('stdin.js');

	await t.throwsAsync(text(piped.readableStream()), {message: /Command failed with exit code 2/});
});

test('The .pipe() return value .all waits for source failure', async t => {
	const piped = execa('fail.js').pipe('stdin.js', {all: true});

	await t.throwsAsync(text(piped.all), {message: /Command failed with exit code 2/});
});

const assertCanceledPipeReader = async (t, getReader, abortBeforePipe = false) => {
	const abortController = new AbortController();
	if (abortBeforePipe) {
		abortController.abort();
	}

	const source = execa('stdin.js');
	const destination = execa('stdin.js', {all: true});
	t.teardown(async () => {
		await cleanupSubprocesses(source, destination);
	});

	const piped = source.pipe(destination, {unpipeSignal: abortController.signal});
	const readerPromise = t.throwsAsync(getReader(piped), {message: /Pipe canceled/});

	if (!abortBeforePipe) {
		abortController.abort();
	}

	await assertSettles(t, readerPromise, 200);
};

test('The .pipe() return value .readable() waits for pipe cancellation', async t => {
	await assertCanceledPipeReader(t, piped => text(piped.readable()));
});

test('The .pipe() return value .all waits for pipe cancellation', async t => {
	await assertCanceledPipeReader(t, piped => text(piped.all));
});

test('The .pipe() return value .readable() waits for already canceled pipes', async t => {
	await assertCanceledPipeReader(t, piped => text(piped.readable()), true);
});

