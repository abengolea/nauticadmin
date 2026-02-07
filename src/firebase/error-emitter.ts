type Listener = (error: Error) => void;

class ErrorEmitter {
  private listeners: Listener[] = [];

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(channel: 'permission-error', error: Error) {
    if (channel === 'permission-error') {
      this.listeners.forEach(listener => listener(error));
    }
  }
}

export const errorEmitter = new ErrorEmitter();
