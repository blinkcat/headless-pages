import { EventEmitter } from "events";

class Master extends EventEmitter {
  jobQueue = [];
  allWorkers = [];
  availableWorkers = [];

  queue(job) {
    return job.promise;
  }

  createWorker() {}
}

class Worker extends EventEmitter {}

class Deferred {}

class Job extends Deferred {}
