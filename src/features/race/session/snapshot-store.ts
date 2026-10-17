/** Holds one immutable value and notifies subscribers when it is replaced. */
export class SnapshotStore<T> {
  private readonly listeners = new Set<() => void>();

  constructor(private value: T) {}

  get current(): T {
    return this.value;
  }

  update(changes: Partial<T>): void {
    this.value = { ...this.value, ...changes };
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** A minimal typed event channel. */
export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  emit(value: T): void {
    for (const listener of this.listeners) listener(value);
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
