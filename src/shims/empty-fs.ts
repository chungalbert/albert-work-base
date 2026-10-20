/** Browser stub so @ts-evtx/core can be bundled without Node fs. */
const notInBrowser = () => {
  throw new Error("Node fs is not available in the browser.");
};

export const promises = {
  readFile: async () => notInBrowser(),
  open: async () => notInBrowser(),
};

export function readFileSync() {
  return notInBrowser();
}

export default { promises, readFileSync };
