import config from '../src/Config';
import Job from '../src/Job';

jest.useFakeTimers();

test('new job should be valid', () => {
  const job = new Job(async () => 1);
  expect(job.valid).toBe(true);
});

test('job instance should have create time', () => {
  expect(new Job(async () => 1).createTime).toBe(Date.now());
});

test('job.start should work well', async () => {
  const res = {};
  const fn = jest.fn(
    () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(res);
        }, 3000);
      })
  );
  const startTime = Date.now();
  const endTime = Date.now() + 3000;
  const job = new Job(fn);
  const page = {};

  job.start(page as any);

  expect(job.startTime).toBe(startTime);
  expect(fn).toBeCalledWith(page);

  jest.advanceTimersByTime(3000);

  await expect(job.promise).resolves.toBe(res);
  expect(job.endTime).toBe(endTime);
  expect(job.valid).toBe(false);
});

test('job will timeout if not started', async () => {
  const job = new Job(async () => {});

  jest.advanceTimersByTime(config.jobTimeoutMs);

  expect(job.promise).rejects.toThrow();
  expect(job.valid).toBe(false);
});
