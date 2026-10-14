'use strict';

const DEFAULT_TIMEOUT_MS = 15000;
const FALLBACK_RETRY_MS = 60000;
const NO_HEADER_DELAY_MS = 2000;
const MAX_RETRIES = 2;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 DailyBriefing/2.2';

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function headerNumber(headers, name) {
  if (!headers || typeof headers.get !== 'function') return null;
  const value = headers.get(name);
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function retryAfterMilliseconds(headers, now) {
  const reset = headerNumber(headers, 'x-ratelimit-reset');
  if (reset != null) return Math.max(0, reset * 1000) + 1000;

  if (headers && typeof headers.get === 'function') {
    const retryAfter = headers.get('retry-after');
    if (retryAfter != null && retryAfter !== '') {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000) + 1000;

      const date = Date.parse(retryAfter);
      if (Number.isFinite(date)) return Math.max(0, date - now) + 1000;
    }
  }

  return FALLBACK_RETRY_MS;
}

class RedditRequestQueue {
  constructor({ fetchImpl, now, sleep } = {}) {
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.now = now || Date.now;
    this.sleep = sleep || defaultSleep;
    this.reset();
  }

  reset() {
    this.tail = Promise.resolve();
    this.lastRequestAt = null;
    this.lastResponseHadRateHeaders = false;
    this.blockedUntil = null;
  }

  fetch(url, options = {}) {
    const queuedAt = this.now();
    const task = this.tail.then(() => this._fetchWithRetries(url, options, queuedAt));
    this.tail = task.catch(() => {});
    return task;
  }

  async _fetchWithRetries(url, options, queuedAt) {
    let retryCount = 0;
    let waitingSince = queuedAt;

    while (true) {
      await this._waitBeforeRequest();
      const waitMs = Math.max(0, this.now() - waitingSince);
      if (options.log && typeof options.log.info === 'function') {
        options.log.info('reddit', `Reddit request waited ${waitMs}ms in queue`, {
          url,
          wait_ms: waitMs,
        });
      }

      const response = await this._fetchOnce(url, options);
      this._recordRateLimit(response.headers);

      if (response.status !== 429 || retryCount >= MAX_RETRIES) return response;

      const retryDelay = retryAfterMilliseconds(response.headers, this.now());
      this.blockedUntil = this.now() + retryDelay;
      retryCount++;
      waitingSince = this.now();
    }
  }

  async _waitBeforeRequest() {
    let notBefore = this.now();

    if (this.lastRequestAt != null) {
      if (this.blockedUntil != null) {
        notBefore = Math.max(notBefore, this.blockedUntil);
      } else if (!this.lastResponseHadRateHeaders) {
        notBefore = Math.max(notBefore, this.lastRequestAt + NO_HEADER_DELAY_MS);
      }
    }

    const delay = Math.max(0, notBefore - this.now());
    if (delay > 0) await this.sleep(delay);
  }

  async _fetchOnce(url, options) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs == null ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const { log, timeoutMs: _timeoutMs, headers = {}, ...fetchOptions } = options;
    try {
      const response = await this.fetchImpl(url, {
        redirect: 'follow',
        ...fetchOptions,
        headers: {
          ...headers,
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      });
      this.lastRequestAt = this.now();
      return response;
    } catch (error) {
      this.lastRequestAt = this.now();
      this.lastResponseHadRateHeaders = false;
      this.blockedUntil = null;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  _recordRateLimit(headers) {
    const remaining = headerNumber(headers, 'x-ratelimit-remaining');
    const reset = headerNumber(headers, 'x-ratelimit-reset');
    this.lastResponseHadRateHeaders = remaining != null || reset != null;
    this.blockedUntil = null;

    if (remaining != null && remaining < 1) {
      const delay = reset == null ? FALLBACK_RETRY_MS : Math.max(0, reset * 1000) + 1000;
      this.blockedUntil = this.now() + delay;
    }
  }
}

const redditRequestQueue = new RedditRequestQueue();

module.exports = {
  RedditRequestQueue,
  redditRequestQueue,
  USER_AGENT,
};
