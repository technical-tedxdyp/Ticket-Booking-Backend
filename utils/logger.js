const formatMessage = (level, message, meta) => {
    const timestamp = new Date().toISOString();
    if (!meta) {
        return `[${timestamp}] ${level}: ${message}`;
    }

    return `[${timestamp}] ${level}: ${message} ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
};

const logger = {
    info: (...args) => console.log(formatMessage('INFO', args[0], args.length > 1 ? args.slice(1) : undefined)),
    warn: (...args) => console.warn(formatMessage('WARN', args[0], args.length > 1 ? args.slice(1) : undefined)),
    error: (...args) => console.error(formatMessage('ERROR', args[0], args.length > 1 ? args.slice(1) : undefined)),
    debug: (...args) => console.debug(formatMessage('DEBUG', args[0], args.length > 1 ? args.slice(1) : undefined)),
};

export default logger;
