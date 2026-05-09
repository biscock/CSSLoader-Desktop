/**
 * Polls ``testFunc`` until it returns truthy, then calls ``onTrue``.
 *
 * On the very first failure (i.e. the backend wasn't already up when the app
 * launched), ``onFirstFalse`` is invoked once \u2014 typically to spawn the
 * backend process.
 *
 * If ``onPersistentFailure`` is supplied, it is also called once every
 * ``persistentFailureEverySeconds`` seconds while the test continues to
 * return falsy. This is the hook that lets the caller force-restart the
 * backend if it never comes up the first time \u2014 a real-world scenario on
 * macOS where the standalone backend can die during init if Steam isn't
 * running yet (the backend tries to attach to Steam's CDP endpoint on
 * startup and gives up if Steam isn't there). Re-running ``startBackend``
 * every few seconds means the backend is automatically retried until the
 * user finishes launching Steam, with no UI interaction required.
 */
export async function recursiveCheck(
  testFunc: () => Promise<boolean> | boolean,
  onTrue: () => void,
  onFirstFalse: () => void,
  onPersistentFailure?: () => void,
  persistentFailureEverySeconds: number = 5
) {
  let consecutiveFailures = 0;

  const recursive = async () => {
    const value = await testFunc();
    if (value) {
      onTrue();
      return;
    }
    consecutiveFailures += 1;
    // Polling cadence is 1s (see setTimeout below), so every Nth failure
    // corresponds to N seconds without a healthy backend.
    if (
      onPersistentFailure &&
      consecutiveFailures % persistentFailureEverySeconds === 0
    ) {
      onPersistentFailure();
    }
    setTimeout(() => {
      recursive();
    }, 1000);
  };

  const value = await testFunc();
  if (value) {
    onTrue();
    return;
  } else {
    onFirstFalse();
    recursive();
  }
}
