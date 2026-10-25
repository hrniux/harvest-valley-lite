import { restoreGameState, serializeGameState } from "./game-state.js";

const SAVE_KEY = "harvest-valley-lite-save";
const statuses = {
  new: "Progress saves automatically in this browser.",
  loaded: "Farm restored. Progress saves automatically in this browser.",
  saved: "Progress saved in this browser.",
  invalid: "Saved farm could not be read. A new farm is ready; playing will replace the unreadable save.",
  unavailable: "Browser storage is unavailable. You can play, but changes are not saved.",
  protected: "Saved progress could not be accessed. Changes are not saved. Reload to retry, or use New farm to replace the saved farm.",
  conflict: "Saved progress changed in another tab. Changes are not saved. Reload to restore the newer farm, or use New farm to replace the saved farm.",
};

export function createSaveStore(getStorage) {
  let status = { kind: "new", message: statuses.new };
  let blockedStatus = null;
  let previousSave = null;
  let allowUnreadableWrites = false;
  const setStatus = (kind) => { status = { kind, message: statuses[kind] }; };
  const write = (state) => {
    try {
      const encoded = serializeGameState(state);
      getStorage().setItem(SAVE_KEY, encoded);
      previousSave = encoded;
      blockedStatus = null;
      setStatus("saved");
      return true;
    } catch {
      setStatus(blockedStatus || "unavailable");
      return false;
    }
  };
  return {
    get status() { return status; },
    load() {
      allowUnreadableWrites = false;
      try {
        const encoded = getStorage().getItem(SAVE_KEY);
        previousSave = encoded;
        blockedStatus = null;
        if (encoded === null) {
          setStatus("new");
          return null;
        }
        const state = restoreGameState(encoded);
        setStatus(state ? "loaded" : "invalid");
        return state;
      } catch {
        // The previous contents are unknown; an ordinary action must not erase them.
        blockedStatus = "protected";
        setStatus("protected");
        return null;
      }
    },
    save(state) {
      if (blockedStatus) {
        setStatus(blockedStatus);
        return false;
      }
      try {
        // Detect a newer tab's write/removal before replacing the bytes we last saw.
        // localStorage does not provide an atomic compare-and-set across tabs.
        if (getStorage().getItem(SAVE_KEY) !== previousSave) {
          blockedStatus = "conflict";
          setStatus("conflict");
          return false;
        }
        allowUnreadableWrites = false;
      } catch {
        // A confirmed successful replacement already authorized replacing the
        // inaccessible farm. Continue its writes until reads become available.
        if (allowUnreadableWrites) return write(state);
        blockedStatus = "protected";
        setStatus("protected");
        return false;
      }
      return write(state);
    },
    // The caller must confirm replacement with the player before using this path.
    replace(state) {
      const saved = write(state);
      if (saved) allowUnreadableWrites = true;
      return saved;
    },
  };
}
