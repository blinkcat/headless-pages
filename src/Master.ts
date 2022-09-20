import { LinkedList } from '@datastructures-js/linked-list';
import EventEmitter from 'events';
import config from './Config';
import Deferred from './Deferred';
import Evictor from './Evictor';
import Job from './Job';
import Worker, { WorkerStatus } from './Worker';

export default class Master extends EventEmitter {
  static readonly error = 'error';

  allWorkers = new Set<Worker>();
  availableWorkers = new LinkedList<Worker>();
  startingWorks = new Set<Worker>();
  waitingJobs = new LinkedList<Job>();

  private isRunning = false;
  private evictor = new Evictor(this);
  private retryDelayMs = 10;
  private createWorkerFailureCount = 0;

  receiveAJob(job: Job) {
    if (this.isRunning == false) {
      this.run();
    }

    this.waitingJobs.insertLast(job);
    this.dispatch();
  }

  createWorker() {
    const worker = new Worker();

    this.allWorkers.add(worker);
    this.startingWorks.add(worker);

    const ready = new Deferred<boolean>();
    let done = false;
    const timer = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      this.startingWorks.delete(worker);
      this.allWorkers.delete(worker);
      ready.resolve(false);
    }, config.maxWaitTimeForCreatingWorkerMs);

    timer.unref();

    worker.on(Worker.error, (err) => {
      this.emit(Master.error, err);
    });

    worker.on(Worker.StatusChanged, (prevStatus: WorkerStatus, status: WorkerStatus) => {
      if (prevStatus == WorkerStatus.PENDING && status == WorkerStatus.IDLE) {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        this.availableWorkers.insertFirst(worker);
        this.startingWorks.delete(worker);
        ready.resolve(true);
      } else if (status == WorkerStatus.BUSY) {
        this.availableWorkers.removeEach((node) => node.getValue() == worker);
      } else if (prevStatus == WorkerStatus.PENDING && status == WorkerStatus.OFFLINE) {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        this.startingWorks.delete(worker);
        this.allWorkers.delete(worker);
        ready.resolve(false);
      } else if (
        prevStatus == WorkerStatus.BUSY &&
        (status == WorkerStatus.IDLE || status == WorkerStatus.ACTIVE)
      ) {
        this.availableWorkers.insertLast(worker);
      } else if (status == WorkerStatus.CLOSING) {
        this.availableWorkers.removeEach((node) => node.getValue() == worker);
      } else if (status == WorkerStatus.OFFLINE) {
        this.availableWorkers.removeEach((node) => node.getValue() == worker);
        this.allWorkers.delete(worker);
        this.dispatch();
      }
    });

    return ready.promise;
  }

  createWorkerAndDispatch(chance = config.chancesToRetryCreatingWorker) {
    if (this.allWorkers.size == config.maxWorkerNum) {
      return;
    }

    this.createWorker().then((ready) => {
      if (ready) {
        this.createWorkerFailureCount = Math.max(this.createWorkerFailureCount - 1, 0);
        this.dispatch();
      } else {
        this.createWorkerFailureCount++;
        if (chance > 0 && this.isRunning) {
          this.retryCreatingWorker(this.createWorkerAndDispatch.bind(this, chance - 1));
        }
      }
    });
  }

  retryCreatingWorker(cb: Function) {
    if (!this.isRunning) {
      return;
    }

    if (this.createWorkerFailureCount > 20) {
      // todo exit?
      return;
    }

    this.retryDelayMs = 1 << this.createWorkerFailureCount;

    setTimeout(() => {
      if (this.isRunning) {
        cb();
      }
    }, this.retryDelayMs).unref();
  }

  tryToCreateMoreWorkers() {
    const need = Math.min(
      Math.ceil(this.waitingJobs.count() / config.maxParallelJobsPerWorker),
      config.maxWorkerNum - this.allWorkers.size
    );

    for (let i = 0; i < need; i++) {
      this.createWorkerAndDispatch();
    }
  }

  ensureMinimumNumOfWorkers() {
    for (let i = this.allWorkers.size; i < config.minWorkerNum; i++) {
      this.createWorkerAndDispatch();
    }
  }

  dispatch() {
    if (this.allWorkers.size < config.minWorkerNum) {
      this.ensureMinimumNumOfWorkers();
    }

    if (this.waitingJobs.isEmpty()) {
      return;
    }

    if (this.availableWorkers.isEmpty()) {
      this.tryToCreateMoreWorkers();
      return;
    }

    while (!this.waitingJobs.isEmpty()) {
      const job = this.waitingJobs.removeFirst().getValue();

      if (!job.valid) {
        continue;
      }

      const worker = this.pickAWorker();

      if (worker == null) {
        this.waitingJobs.insertFirst(job);
        break;
      }

      worker.receiveAJob(job);
    }
  }

  pickAWorker() {
    if (this.availableWorkers.isEmpty()) {
      return null;
    }

    let candidate = this.availableWorkers.head();
    let status = candidate.getValue().status;

    while (status != WorkerStatus.IDLE && status != WorkerStatus.ACTIVE) {
      if (candidate.hasNext() == false) {
        return null;
      }
      candidate = candidate.getNext();
      status = candidate.getValue().status;
    }

    return candidate.getValue();
  }

  async close(elegant = true) {
    await Promise.all(Array.from(this.allWorkers).map((worker) => worker.close(elegant)));
    this.removeAllListeners();
    this.isRunning = false;
  }

  run() {
    if (this.isRunning == false) {
      this.isRunning = true;
      this.ensureMinimumNumOfWorkers();
      this.evictor.schedule();
    }
  }
}
