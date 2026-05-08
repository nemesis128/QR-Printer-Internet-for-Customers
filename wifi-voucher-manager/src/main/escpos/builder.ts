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
