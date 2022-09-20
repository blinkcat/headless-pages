import EventEmitter from 'events';
import Puppeteer, { Browser, Page } from 'puppeteer';
import config from './Config';
import Deferred from './Deferred';
import Job from './Job';

export enum WorkerStatus {
  INIT,
  PENDING,
  IDLE,
  ACTIVE,
  BUSY,
  CLOSING,
  OFFLINE,
}

export default class Worker extends EventEmitter {
  static readonly StatusChanged = 'StatusChanged';
  static readonly error = 'error';

  private _lastWorkTime = Date.now();
  private _createTime = Date.now();
  private _status = WorkerStatus.INIT;
  private jobInProcess = 0;
  private browser?: Browser;
  private pollCheckAllJobsDone?: NodeJS.Timeout;

  get status() {
    return this._status;
  }

  get lastWorkTime() {
    return this._lastWorkTime;
  }

  get createTime() {
    return this._createTime;
  }

  constructor() {
    super();
    this.markAs(WorkerStatus.PENDING);
    this.launchBrowser();
  }

  markAs(status: WorkerStatus) {
    if (status == WorkerStatus.ACTIVE || status == WorkerStatus.BUSY) {
      this._lastWorkTime = Date.now();
    }

    // lock status
    if (this._status == WorkerStatus.CLOSING && status != WorkerStatus.OFFLINE) {
      return false;
    }

    if (status != this._status) {
      this.emit(Worker.StatusChanged, this._status, status);
      this._status = status;
      return true;
    }

    return false;
  }

  receiveAJob(job: Job) {
    if (
      this.jobInProcess == config.maxParallelJobsPerWorker ||
      this._status == WorkerStatus.CLOSING ||
      this._status == WorkerStatus.OFFLINE
    ) {
      this.emit(
        Worker.error,
        new Error(
          'this woker is busy or closing or offline, should not receive more jobs!!! there may be a bug.'
        )
      );
      return false;
    }

    this.jobInProcess++;

    if (this.jobInProcess == config.maxParallelJobsPerWorker) {
      this.markAs(WorkerStatus.BUSY);
    } else {
      this.markAs(WorkerStatus.ACTIVE);
    }

    this.handleJob(job).finally(() => {
      this.jobInProcess--;

      if (this.jobInProcess == 0) {
        this.markAs(WorkerStatus.IDLE);
      } else if (this.jobInProcess < config.maxParallelJobsPerWorker) {
        this.markAs(WorkerStatus.ACTIVE);
      }
    });
  }

  async close(elegant = true) {
    if (this.status == WorkerStatus.CLOSING || this.status == WorkerStatus.OFFLINE) {
      return;
    }

    this.markAs(WorkerStatus.CLOSING);

    if (elegant) {
      if (this.jobInProcess != 0) {
        await this.drain();
      }
    }

    clearInterval(this.pollCheckAllJobsDone);

    await this.browser?.close();

    this.markAs(WorkerStatus.OFFLINE);
    this.removeAllListeners();
  }

  protected launchBrowser() {
    return Puppeteer.launch(config.launchOptions)
      .then((browser) => {
        this.browser = browser;
        this.markAs(WorkerStatus.IDLE);
      })
      .catch((err) => {
        this.emit(Worker.error, err);
        this.markAs(WorkerStatus.OFFLINE);
      });
  }

  private drain() {
    const res = new Deferred<true>();

    if (this.jobInProcess == 0) {
      res.resolve(true);
    } else {
      this.pollCheckAllJobsDone = setInterval(() => {
        if (this.jobInProcess == 0) {
          clearInterval(this.pollCheckAllJobsDone);
          res.resolve(true);
        }
      }, 100).unref();
    }

    return res.promise;
  }

  private async handleJob(job: Job) {
    let page: Page | null = null;
    try {
      page = await this.browser!.newPage();
      await job.start(page);
    } catch (err) {
      if (job.valid) {
        job.reject(err);
      }
      this.emit(Worker.error, err);
      return false;
    } finally {
      await page?.close();
    }
    return true;
  }
}
