import {createWriteStream} from 'node:fs';
import type {Readable} from 'node:stream';
import type {ReadableStream} from 'node:stream/web';
import {expectType, expectNotType, expectError} from 'tsd';
import {
	execa,
	execaSync,
	$,
	type Result,
	type Message,
} from '../index.js';

const fileUrl = new URL('file:///test');
const stringArray = ['foo', 'bar'] as const;
const pipeOptions = {from: 'stderr', to: 'fd3', all: true} as const;

const subprocess = execa('unicorns', {all: true});
const bufferSubprocess = execa('unicorns', {encoding: 'buffer', all: true});
const scriptSubprocess = $`unicorns`;

const bufferResult = await bufferSubprocess;
type BufferExecaReturnValue = typeof bufferResult;
type EmptyExecaReturnValue = Result<{}>;
type ShortcutExecaReturnValue = Result<typeof pipeOptions>;

expectNotType<BufferExecaReturnValue>(await subprocess.pipe(subprocess));
expectNotType<BufferExecaReturnValue>(await scriptSubprocess.pipe(subprocess));
expectType<BufferExecaReturnValue>(await subprocess.pipe(bufferSubprocess));
expectType<BufferExecaReturnValue>(await scriptSubprocess.pipe(bufferSubprocess));
expectType<BufferExecaReturnValue>(await subprocess.pipe(bufferSubprocess, pipeOptions));
expectType<BufferExecaReturnValue>(await scriptSubprocess.pipe(bufferSubprocess, pipeOptions));

expectType<EmptyExecaReturnValue>(await subprocess.pipe`stdin`);
expectType<EmptyExecaReturnValue>(await scriptSubprocess.pipe`stdin`);
expectType<ShortcutExecaReturnValue>(await subprocess.pipe(pipeOptions)`stdin`);
expectType<ShortcutExecaReturnValue>(await scriptSubprocess.pipe(pipeOptions)`stdin`);

expectType<EmptyExecaReturnValue>(await subprocess.pipe('stdin'));
expectType<EmptyExecaReturnValue>(await scriptSubprocess.pipe('stdin'));
expectType<ShortcutExecaReturnValue>(await subprocess.pipe('stdin', pipeOptions));
expectType<ShortcutExecaReturnValue>(await scriptSubprocess.pipe('stdin', pipeOptions));

expectType<BufferExecaReturnValue>(await subprocess.pipe(subprocess).pipe(bufferSubprocess));
… trimmed for the evaluation dataset …
expectError(await subprocess.pipe('stdin', {to: 'other'}));
expectError(await subprocess.pipe('stdin', [], {to: 'other'}));

const pipeResult = await subprocess.pipe`stdin`;
expectType<string>(pipeResult.stdout);
const ignorePipeResult = await subprocess.pipe({stdout: 'ignore'})`stdin`;
expectType<undefined>(ignorePipeResult.stdout);

const scriptPipeResult = await scriptSubprocess.pipe`stdin`;
expectType<string>(scriptPipeResult.stdout);
const ignoreScriptPipeResult = await scriptSubprocess.pipe({stdout: 'ignore'})`stdin`;
expectType<undefined>(ignoreScriptPipeResult.stdout);

const shortcutPipeResult = await subprocess.pipe('stdin');
expectType<string>(shortcutPipeResult.stdout);
const ignoreShortcutPipeResult = await subprocess.pipe('stdin', {stdout: 'ignore'});
expectType<undefined>(ignoreShortcutPipeResult.stdout);

const scriptShortcutPipeResult = await scriptSubprocess.pipe('stdin');
expectType<string>(scriptShortcutPipeResult.stdout);
const ignoreShortcutScriptPipeResult = await scriptSubprocess.pipe('stdin', {stdout: 'ignore'});
expectType<undefined>(ignoreShortcutScriptPipeResult.stdout);

const unicornsResult = execaSync('unicorns');
expectError(unicornsResult.pipe);

// The `.pipe()` return value forwards the destination subprocess' iteration, stream conversion and IPC methods.
for await (const pipeLine of subprocess.pipe`stdin`) {
	expectType<string>(pipeLine);
}

for await (const pipeLine of subprocess.pipe`stdin`.iterable()) {
	expectType<string>(pipeLine);
}

for await (const pipeLine of subprocess.pipe(bufferSubprocess)) {
	expectType<Uint8Array>(pipeLine);
}

expectType<Readable>(subprocess.pipe`stdin`.readable());
expectType<ReadableStream>(subprocess.pipe`stdin`.readableStream());

expectType<Readable>(subprocess.pipe({all: true})`stdin`.all);
expectType<undefined>(subprocess.pipe`stdin`.all);

expectType<undefined>(subprocess.pipe`stdin`.sendMessage);
const ipcPipeResult = subprocess.pipe({ipc: true})`stdin`;
expectType<Promise<void>>(ipcPipeResult.sendMessage('message'));
expectType<Promise<Message<'advanced'>>>(ipcPipeResult.getOneMessage());
expectType<AsyncIterableIterator<Message<'advanced'>>>(ipcPipeResult.getEachMessage());

// `writable()`, `duplex()`, `writableStream()` and `transformStream()` write to the destination's `stdin`, which is already piped from the source, so they are not forwarded.
expectError(subprocess.pipe`stdin`.writable());
expectError(subprocess.pipe`stdin`.duplex());
expectError(subprocess.pipe`stdin`.writableStream());
expectError(subprocess.pipe`stdin`.transformStream());
