declare module 'utif' {
  interface IFD {
    width: number;
    height: number;
    data?: Uint8Array;
    [key: string]: any;
  }

  function decode(buffer: ArrayBuffer): IFD[];
  function decodeImage(buffer: ArrayBuffer, ifd: IFD): void;
  function toRGBA8(ifd: IFD): Uint8Array;
  function encodeImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, metadata?: any): ArrayBuffer;
}
