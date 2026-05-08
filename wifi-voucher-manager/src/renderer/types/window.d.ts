import type { IpcAPI } from '../../shared/types.js';

declare global {
  interface Window {
    api: IpcAPI;
  }
}

export {};
