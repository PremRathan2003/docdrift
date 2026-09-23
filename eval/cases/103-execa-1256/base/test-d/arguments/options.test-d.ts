execaSync('unicorns', {all: true});
await execa('unicorns', {all: true as boolean});
execaSync('unicorns', {all: true as boolean});
expectError(await execa('unicorns', {all: 'true'}));
expectError(execaSync('unicorns', {all: 'true'}));

await execa('unicorns', {ipc: true});
expectError(execaSync('unicorns', {ipc: true}));
await execa('unicorns', {ipc: true as boolean});
expectError(execaSync('unicorns', {ipc: true as boolean}));
expectError(await execa('unicorns', {ipc: 'true'}));
expectError(execaSync('unicorns', {ipc: 'true'}));

await execa('unicorns', {serialization: 'json'});
expectError(execaSync('unicorns', {serialization: 'json'}));
await execa('unicorns', {serialization: 'advanced'});
expectError(execaSync('unicorns', {serialization: 'advanced'}));
expectError(await execa('unicorns', {serialization: 'advanced' as string}));
expectError(execaSync('unicorns', {serialization: 'advanced' as string}));
expectError(await execa('unicorns', {serialization: 'other'}));
expectError(execaSync('unicorns', {serialization: 'other'}));

await execa('unicorns', {ipcInput: ''});
expectError(execaSync('unicorns', {ipcInput: ''}));
await execa('unicorns', {ipcInput: '' as string});
expectError(execaSync('unicorns', {ipcInput: '' as string}));
await execa('unicorns', {ipcInput: {}});
expectError(execaSync('unicorns', {ipcInput: {}}));
await execa('unicorns', {ipcInput: undefined});
execaSync('unicorns', {ipcInput: undefined});
expectError(await execa('unicorns', {ipcInput: 0n}));
expectError(execaSync('unicorns', {ipcInput: 0n}));

await execa('unicorns', {detached: true});
expectError(execaSync('unicorns', {detached: true}));
await execa('unicorns', {detached: true as boolean});
expectError(execaSync('unicorns', {detached: true as boolean}));
expectError(await execa('unicorns', {detached: 'true'}));
expectError(execaSync('unicorns', {detached: 'true'}));

await execa('unicorns', {cancelSignal: AbortSignal.abort()});
expectError(execaSync('unicorns', {cancelSignal: AbortSignal.abort()}));
expectError(await execa('unicorns', {cancelSignal: false}));
expectError(execaSync('unicorns', {cancelSignal: false}));

await execa('unicorns', {gracefulCancel: true, cancelSignal: AbortSignal.abort()});
expectError(execaSync('unicorns', {gracefulCancel: true, cancelSignal: AbortSignal.abort()}));
await execa('unicorns', {gracefulCancel: true as boolean, cancelSignal: AbortSignal.abort()});
expectError(execaSync('unicorns', {gracefulCancel: true as boolean, cancelSignal: AbortSignal.abort()}));
expectError(await execa('unicorns', {gracefulCancel: 'true', cancelSignal: AbortSignal.abort()}));
expectError(execaSync('unicorns', {gracefulCancel: 'true', cancelSignal: AbortSignal.abort()}));
