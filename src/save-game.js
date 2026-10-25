import { restoreGameState, serializeGameState } from "./game-state.js";

const SAVE_KEY = "harvest-valley-lite-save";
const statuses = {
  new: "Progress saves automatically in this browser.",
  loaded: "Farm restored. Progress saves automatically in this browser.",
  saved: "Progress saved in this browser.",
  invalid: "Saved farm could not be read. A new farm is ready; playing will replace the unreadable save.",
  unavailable: "Browser storage is unavailable. You can play, but changes are not saved.",
  protected: "Saved progress could not be accessed. Changes are not saved. Reload to retry, or use New farm to replace the saved farm.",
};

export function createSaveStore(getStorage) {
  let status = { kind: "new", message: statuses.new };
  let protectPreviousSave = false;
  const setStatus = (kind) => { status = { kind, message: statuses[kind] }; };
  const write = (state) => {
    try {
      getStorage().setItem(SAVE_KEY, serializeGameState(state));
      protectPreviousSave = false;
      setStatus("saved");
      return true;
    } catch {
      setStatus(protectPreviousSave ? "protected" : "unavailable");
      return false;
    }
  };
  return {
    get status() { return status; },
    load() {
      try {
        const encoded = getStorage().getItem(SAVE_KEY);
        protectPreviousSave = false;
        if (encoded === null) {
          setStatus("new");
          return null;
        }
        const state = restoreGameState(encoded);
        setStatus(state ? "loaded" : "invalid");
        return state;
      } catch {
        // The previous contents are unknown; an ordinary action must not erase them.
        protectPreviousSave = true;
        setStatus("protected");
        return null;
      }
    },
    save(state) {
      if (protectPreviousSave) {
        setStatus("protected");
        return false;
      }
      return write(state);
    },
    // The caller must confirm replacement with the player before using this path.
    replace: write,
  };
}
