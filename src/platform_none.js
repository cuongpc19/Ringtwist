/* ---------------- no host ----------------
   The same door as platform_crazy.js, for builds that run anywhere else (local
   play, a plain web upload). It names no host and loads nothing: build.py picks
   exactly one of the two files, so the portal SDK never reaches another
   site and the reverse.                                                       */

const localStore = {
  getItem(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  setItem(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* progress just will not persist */ } },
  removeItem(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing to do */ } },
};

const PLATFORM = {
  name: "none",
  async init() {},
  storage: localStore,
  loadingStart() {},
  loadingStop() {},
  gameplayStart() {},
  gameplayStop() {},
  happytime() {},
  hostMuted() {
    try { return new URLSearchParams(location.search).get("muteAudio") === "true"; } catch (e) { return false; }
  },
  onHostMuteChange() {},
  /* no ads anywhere off the portal: a rewarded ad is never offered */
  canReward() { return false; },
  rewarded() { return Promise.resolve(false); },
};
