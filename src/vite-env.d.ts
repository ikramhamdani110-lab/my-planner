/// <reference types="vite/client" />

// sql.js ships the WebAssembly binary as a static asset.
declare module 'sql.js/dist/sql-wasm.wasm?url' {
  const url: string;
  export default url;
}
