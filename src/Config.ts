import type { PuppeteerLaunchOptions } from 'puppeteer';

export class Config {
  // puppeteer related
  /**
   * @see https://blog.it2048.cn/article-puppeteer-speed-up/
   * @see https://github.com/puppeteer/puppeteer/issues/3938
   * @description headless chrome 优化配置
   */
  launchOptions: PuppeteerLaunchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-web-security',
      '--hide-scrollbars',
      '--disable-infobars',
      '--mute-audio',
      '--no-startup-window',
      //   "--enable-accelerated-2d-canvas",
    ],
  };
  // worker related
  chancesToRetryCreatingWorker = 3;
  maxWaitTimeForCreatingWorkerMs = 30000;
  maxParallelJobsPerWorker = 2;
  minWorkerNum = 1;
  maxWorkerNum = 2;
  lifeSpanMsOfWorkers = 1 * 60 * 60 * 1000;
  maxIdleTimeMsOfWorkers = 0.5 * 60 * 60 * 1000;
  // job related
  jobTimeoutMs = 60000;
  // evictor
  evictionPeriodMs = 30 * 60 * 1000;
  maxEvictionNumEachTime = 1;
}

const config = new Config();

export default config;
