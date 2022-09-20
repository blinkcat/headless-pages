import { PriorityQueue, ICompare } from '@datastructures-js/priority-queue';
import config from './Config';
import Master from './Master';
import Worker, { WorkerStatus } from './Worker';

export default class Evictor {
  private compare: ICompare<Worker> = (a, b) => {
    if (a.createTime != b.createTime) {
      return b.createTime - a.createTime;
    }
    return a.lastWorkTime - b.lastWorkTime;
  };

  private timer?: NodeJS.Timeout;

  constructor(private master: Master) {}

  schedule() {
    clearInterval(this.timer);
    this.timer = setInterval(this.evict.bind(this), config.evictionPeriodMs).unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  private evict() {
    const candidates = new PriorityQueue<Worker>(this.compare);
    const currentTime = Date.now();

    for (const worker of this.master.allWorkers) {
      if (![WorkerStatus.IDLE, WorkerStatus.ACTIVE, WorkerStatus.BUSY].includes(worker.status)) {
        continue;
      }

      if (currentTime - worker.createTime >= config.lifeSpanMsOfWorkers) {
        candidates.enqueue(worker);
      }

      if (currentTime - worker.lastWorkTime >= config.maxIdleTimeMsOfWorkers) {
        candidates.enqueue(worker);
      }
    }

    candidates
      .toArray()
      .slice(0, config.maxEvictionNumEachTime)
      .forEach((worker) => worker.close());
  }
}
