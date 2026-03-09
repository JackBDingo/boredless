/** Simple structured logger */
export const logger = {
  info(msg: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'info', msg, ...data, ts: Date.now() }));
  },
  warn(msg: string, data?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: 'warn', msg, ...data, ts: Date.now() }));
  },
  error(msg: string, data?: Record<string, unknown>) {
    console.error(JSON.stringify({ level: 'error', msg, ...data, ts: Date.now() }));
  },
};
