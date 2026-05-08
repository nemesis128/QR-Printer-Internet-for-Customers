import { PNG } from 'pngjs';

import * as cmd from './commands.js';

export class EscPosBuilder {
  private chunks: Uint8Array[] = [];

  private push(bytes: Uint8Array): this {
    this.chunks.push(bytes);
    return this;
  }

  init(): this {
    return this.push(cmd.INIT);
  }

  codepage(): this {
    return this.push(cmd.CODEPAGE_CP858);
  }

  text(s: string): this {
    return this.push(new TextEncoder().encode(s));
  }

  newline(): this {
    return this.push(new Uint8Array([cmd.LF]));
  }

  alignLeft(): this {
    return this.push(cmd.ALIGN_LEFT);
  }

  alignCenter(): this {
    return this.push(cmd.ALIGN_CENTER);
  }

  alignRight(): this {
    return this.push(cmd.ALIGN_RIGHT);
  }

  bold(on: boolean): this {
    return this.push(on ? cmd.BOLD_ON : cmd.BOLD_OFF);
  }

  sizeNormal(): this {
    return this.push(cmd.SIZE_NORMAL);
  }

  sizeDouble(): this {
    return this.push(cmd.SIZE_DOUBLE);
  }

  feed(n: number): this {
    return this.push(cmd.feedLines(n));
  }

  cut(): this {
    return this.push(cmd.CUT_FULL);
  }

  image(pngBuffer: Buffer, opts?: { threshold?: number }): this {
    const threshold = opts?.threshold ?? 128;
    const png = PNG.sync.read(pngBuffer);
    const { width, height, data } = png;

    if (width > 65_535) {
      throw new Error(`Imagen demasiado ancha: ${width}px (max 65535)`);
    }

    const bytesPerRow = Math.ceil(width / 8);
    if (bytesPerRow > 8000) {
      throw new Error(`Imagen demasiado ancha: ${bytesPerRow} bytes/row (max 8000)`);
    }

    const payload = new Uint8Array(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        const r = data[idx]!;
        const g = data[idx + 1]!;
        const b = data[idx + 2]!;
        // luminance Y = 0.299R + 0.587G + 0.114B
        const luma = (r * 299 + g * 587 + b * 114) / 1000;
        const isBlack = luma < threshold;
        if (isBlack) {
          const byteIdx = y * bytesPerRow + (x >> 3);
          const bitInByte = 7 - (x & 7);
          payload[byteIdx]! |= 1 << bitInByte;
        }
      }
    }

    this.push(cmd.rasterHeader(bytesPerRow, height));
    this.push(payload);
    return this;
  }

  raw(bytes: Uint8Array): this {
    return this.push(bytes);
  }

  build(): Uint8Array {
    const total = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}
