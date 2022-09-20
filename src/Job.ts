import type { Page } from 'puppeteer';
import config from './Config';
import Deferred, { DeferredState } from './Deferred';

export interface IJobDescriber<R = any> {
  (page: Page): Promise<R>;
}

export default class Job<R = any> extends Deferred<R> {
  createTime: number;
  expirationTime: number;
  startTime?: number;
  endTime?: number;

  private timeoutRef?: NodeJS.Timeout;

  constructor(private describer: IJobDescriber<R>) {
    super();
    this.createTime = Date.now();
    this.expirationTime = this.createTime + config.jobTimeoutMs;
    this.timeout();
  }

  get valid() {
    return this.state == DeferredState.PENDING;
  }

  info() {
    return {
      createTime: this.createTime,
      startTime: this.startTime,
      endTime: this.endTime,
      expirationTime: this.expirationTime,
      valid: this.valid,
    };
  }

  async start(page: Page) {
    if (this.valid == false) {
      throw Error(`this job have been timeout or finished!`);
    }

    clearTimeout(this.timeoutRef);

    this.startTime = Date.now();
    try {
      this.resolve(await this.describer(page));
    } catch (err) {
      this.reject(err);
    } finally {
      this.endTime = Date.now();
    }
  }

  private timeout() {
    if (config.jobTimeoutMs) {
      this.timeoutRef = setTimeout(() => {
        if (this.valid) {
          this.reject(new Error('job timeout'));
        }
      }, config.jobTimeoutMs).unref();
    }
  }
}
