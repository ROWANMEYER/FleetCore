type DraftChangeListener = (key: string, value: unknown) => void;

const channels = new Map<string, Set<DraftChangeListener>>();

export function publishDraftChange(key: string, value: unknown): void {
  const listeners = channels.get(key);
  if (!listeners) return;
  for (const listener of Array.from(listeners)) {
    try {
      listener(key, value);
    } catch {
      /* a broken listener must not stop the others */
    }
  }
}

export function subscribeDraftChanges(
  key: string,
  listener: DraftChangeListener
): () => void {
  let listeners = channels.get(key);
  if (!listeners) {
    listeners = new Set<DraftChangeListener>();
    channels.set(key, listeners);
  }
  listeners.add(listener);

  return () => {
    const current = channels.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) channels.delete(key);
  };
}

export function draftChannelListenerCount(key: string): number {
  return channels.get(key)?.size ?? 0;
}

export function resetDraftChannels(): void {
  channels.clear();
}
