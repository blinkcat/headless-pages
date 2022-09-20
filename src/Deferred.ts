export enum DeferredState {
  PENDING,
  FULFILLED,
  REJECTED,
}

export default class Deferred<V = any> {
  private _state = DeferredState.PENDING;
  private _resolve!: (value: V | PromiseLike<V>) => void;
  private _reject!: (reason?: any) => void;
  private _promise = new Promise<V>((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });

  get state() {
    return this._state;
  }

  get promise() {
    return this._promise;
  }

  reject(reason: any) {
    if (this._state !== DeferredState.PENDING) {
      return;
    }
    this._state = DeferredState.REJECTED;
    this._reject(reason);
  }

  resolve(value: V) {
    if (this._state !== DeferredState.PENDING) {
      return;
    }
    this._state = DeferredState.FULFILLED;
    this._resolve(value);
  }
}
