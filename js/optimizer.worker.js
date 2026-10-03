// Runs the optimizer off the main thread so the UI stays responsive.
import { optimize } from './optimizer.js';

self.onmessage = (e) => {
  const { room, instances, seed } = e.data;
  try {
    const best = optimize(room, instances, {
      seed,
      onProgress: (progress, score) => self.postMessage({ type: 'progress', progress, score }),
    });
    self.postMessage({ type: 'done', instances: best.instances });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
