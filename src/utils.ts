import { SHA256, enc } from 'crypto-js';


export const shaForString = function(str: string): string {
  return enc.Base64.stringify(SHA256(str));
};
