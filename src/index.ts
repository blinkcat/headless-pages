import Master from './Master';
import Job, { IJobDescriber } from './Job';

const master = new Master();

const cluster = {
  receive<R>(fn: IJobDescriber<R>) {
    const job = new Job<R>(fn);

    master.receiveAJob(job);

    return job.promise;
  },
};

export default cluster;
