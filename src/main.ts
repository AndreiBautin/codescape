import './styles.css';
import { parseConfig } from './core/config';
import { consoleSink, createLogger } from './core/log';
import { startApp } from './ui/app';

// Composition root: the only place that reads the wall clock, the URL and the environment.
const log = createLogger(consoleSink, import.meta.env.DEV ? 'debug' : 'warn');
const { config, warnings } = parseConfig(window.location.search);
if (warnings.length > 0) log.warn('config.invalid_params', { count: warnings.length });

startApp({
  config,
  seed: config.seed ?? Date.now() % 2147483647,
  log,
  now: () => performance.now(),
});

// The installed app updates itself on the next launch: a screensaver has no in-progress work to
// lose, so there is nothing to prompt about.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(
    () => log.info('sw.registered'),
    () => log.warn('sw.failed'),
  );
}
