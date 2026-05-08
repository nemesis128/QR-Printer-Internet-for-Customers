import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // IpcAPI llega en Fase 1; por ahora exponemos namespace vacío para validar el patrón.
  hello: () => 'hello from preload',
});
