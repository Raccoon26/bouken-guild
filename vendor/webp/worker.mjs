import factory from './webp_enc.mjs';
import {defaultOptions} from './meta.mjs';
let codec;
self.onmessage = async ({data}) => {
  try {
    if (!codec) codec = (async () => {
      const response = await fetch(new URL('./webp_enc.wasm', import.meta.url));
      if (!response.ok) throw Error();
      return factory({wasmBinary: await response.arrayBuffer(), noInitialRun:true});
    })();
    const module = await codec;
    const result = module.encode(data.pixels, data.width, data.height, {...defaultOptions, quality:data.quality});
    if (!result) throw Error();
    const bytes = new Uint8Array(result).buffer;
    self.postMessage({id:data.id, bytes}, [bytes]);
  } catch {
    codec = null;
    self.postMessage({id:data.id, error:true});
  }
};
