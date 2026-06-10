import type { Call, StreamVideoClient } from "@stream-io/video-react-sdk";

interface CallSession {
  call: Call;
  joinPromise: Promise<unknown>;
  refs: number;
}

// One live join per call cid. React StrictMode unmounts and immediately
// remounts components in dev; joining + leaving + rejoining the same call
// session races the SFU and strands the UI in "Joining…" or "Class Ended".
// The registry hands the remount the same in-flight join, and `releaseCall`
// only tears down after a tick when no mount has re-acquired it.
const sessions = new Map<string, CallSession>();

export function acquireCall(
  client: StreamVideoClient,
  type: string,
  id: string,
): CallSession {
  const key = `${type}:${id}`;
  let entry = sessions.get(key);
  if (!entry) {
    const call = client.call(type, id);
    entry = { call, joinPromise: call.join({ create: false }), refs: 0 };
    sessions.set(key, entry);
  }
  entry.refs += 1;
  return entry;
}

export function releaseCall(type: string, id: string): void {
  const key = `${type}:${id}`;
  const entry = sessions.get(key);
  if (!entry) return;
  entry.refs -= 1;
  setTimeout(() => {
    const current = sessions.get(key);
    if (current === entry && entry.refs <= 0) {
      sessions.delete(key);
      // Never leave() mid-join — wait for the join to settle first.
      entry.joinPromise.then(() => entry.call.leave()).catch(() => {});
    }
  }, 0);
}
