/**
 * React binding for the PWA install state exposed by `app/pwa`.
 *
 * Kept out of `pwa.ts` so that module stays framework-free (it is also loaded
 * by the service-worker registration path).
 */
import { useEffect, useState } from "react";
import {
  getInstallState,
  promptInstall,
  subscribeInstall,
  type InstallState,
} from "../../app/pwa";

export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(getInstallState);
  useEffect(() => subscribeInstall(setState), []);
  return state;
}

export { promptInstall };
