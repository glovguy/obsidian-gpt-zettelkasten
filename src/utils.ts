import { SHA256, enc } from 'crypto-js';


export const shaForString = function(str: string): string {
  return enc.Base64.stringify(SHA256(str));
};

export const debounce = function(func: () => void, timeout = 300) {
  let timer: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
};
