/** The one logging sink. Fields are scalars only — the type forbids strings, so file paths and
 *  file contents can never end up in a log line. */
export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Fields = Readonly<Record<string, number | boolean>>;
export type Sink = (level: Level, event: string, fields: Fields) => void;

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(event: string, fields?: Fields): void;
  info(event: string, fields?: Fields): void;
  warn(event: string, fields?: Fields): void;
  error(event: string, fields?: Fields): void;
}

export const consoleSink: Sink = (level, event, fields) => {
  console[level === 'debug' ? 'log' : level](`[codescape] ${event}`, fields);
};

export function createLogger(sink: Sink, min: Level): Logger {
  const at =
    (level: Level) =>
    (event: string, fields: Fields = {}) => {
      if (ORDER[level] >= ORDER[min]) sink(level, event, fields);
    };
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}
