export const logger = { debug: (...args) => process.env.LOG_LEVEL === 'debug' && console.debug(...args) };
