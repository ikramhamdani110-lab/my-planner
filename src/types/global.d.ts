import type { ApiBridge } from './types';

declare global {
  interface Window { api: ApiBridge }
}

export {};
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}
