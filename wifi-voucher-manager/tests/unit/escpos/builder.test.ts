import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import * as cmd from '../../../src/main/escpos/commands.js';
import { EscPosBuilder } from '../../../src/main/escpos/builder.js';

describe('EscPosBuilder primitives', () => {
  it('init() emite ESC @ y codepage', () => {
    const b = new EscPosBuilder();
    const out = b.init().build();
    expect(out.subarray(0, 2)).toEqual(cmd.INIT);
  });

  it('text() agrega los bytes UTF-8 del string', () => {
    const b = new EscPosBuilder();
    const out = b.text('Hola').build();
    const expected = new TextEncoder().encode('Hola');
    expect(Array.from(out.slice(-expected.length))).toEqual(Array.from(expected));
  });

  it('newline() emite LF (0x0a)', () => {
    const b = new EscPosBuilder();
    const out = b.newline().build();
    expect(out[out.length - 1]).toBe(0x0a);
  });

  it('alignCenter() emite ESC a 1', () => {
    const b = new EscPosBuilder();
    const out = b.alignCenter().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.ALIGN_CENTER));
  });

  it('alignLeft() emite ESC a 0', () => {
    const b = new EscPosBuilder();
    const out = b.alignLeft().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.ALIGN_LEFT));
  });

  it('bold(true) emite ESC E 1', () => {
    const b = new EscPosBuilder();
    const out = b.bold(true).build();
    expect(Array.from(out)).toEqual(Array.from(cmd.BOLD_ON));
  });

  it('bold(false) emite ESC E 0', () => {
    const b = new EscPosBuilder();
    const out = b.bold(false).build();
    expect(Array.from(out)).toEqual(Array.from(cmd.BOLD_OFF));
  });

  it('sizeDouble() emite GS ! 0x11', () => {
    const b = new EscPosBuilder();
    const out = b.sizeDouble().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.SIZE_DOUBLE));
  });

  it('sizeNormal() emite GS ! 0x00', () => {
    const b = new EscPosBuilder();
    const out = b.sizeNormal().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.SIZE_NORMAL));
  });

  it('feed(3) emite ESC d 3', () => {
    const b = new EscPosBuilder();
    const out = b.feed(3).build();
    expect(Array.from(out)).toEqual(Array.from(cmd.feedLines(3)));
  });

  it('cut() emite la variante completa Aomus-compatible', () => {
    const b = new EscPosBuilder();
    const out = b.cut().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.CUT_FULL));
  });

  it('chained: init → alignCenter → text → cut produce concatenación correcta', () => {
    const b = new EscPosBuilder();
    const out = b
      .init()
      .alignCenter()
      .text('TEST')
      .cut()
      .build();
    // INIT (2) + ALIGN_CENTER (3) + 'TEST' (4) + CUT_FULL (4) = 13 bytes
    expect(out.length).toBe(2 + 3 + 4 + 4);
    expect(Array.from(out.subarray(0, 2))).toEqual(Array.from(cmd.INIT));
    expect(Array.from(out.subarray(2, 5))).toEqual(Array.from(cmd.ALIGN_CENTER));
    expect(Array.from(out.subarray(5, 9))).toEqual(Array.from(new TextEncoder().encode('TEST')));
    expect(Array.from(out.subarray(9))).toEqual(Array.from(cmd.CUT_FULL));
  });
});

describe('EscPosBuilder.image', () => {
  function makeSolidPng(width: number, height: number, isBlack: boolean): Buffer {
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        const v = isBlack ? 0 : 255;
        png.data[idx] = v;
        png.data[idx + 1] = v;
        png.data[idx + 2] = v;
        png.data[idx + 3] = 255;
      }
    }
    return PNG.sync.write(png);
  }

  it('produce header GS v 0 + payload del tamaño esperado', () => {
    const b = new EscPosBuilder();
    const png = makeSolidPng(16, 8, true); // 16x8 todo negro
    const out = b.image(png).build();

    // bytes-per-row = ceil(16/8) = 2; rows = 8; payload = 2*8 = 16 bytes.
    const headerLen = 8; // 'GS v 0 m xL xH yL yH'
    expect(out.length).toBe(headerLen + 16);

    // Validar header
    expect(Array.from(out.subarray(0, headerLen))).toEqual(
      Array.from(cmd.rasterHeader(2, 8))
    );

    // Todo negro → todos los bytes del payload deben ser 0xFF (8 bits encendidos)
    for (let i = headerLen; i < out.length; i++) {
      expect(out[i]).toBe(0xff);
    }
  });

  it('PNG totalmente blanco produce payload de 0x00', () => {
    const b = new EscPosBuilder();
    const png = makeSolidPng(16, 4, false);
    const out = b.image(png).build();
    const headerLen = 8;
    for (let i = headerLen; i < out.length; i++) {
      expect(out[i]).toBe(0x00);
    }
  });

  it('width que no es múltiplo de 8 redondea hacia arriba', () => {
    const b = new EscPosBuilder();
    const png = makeSolidPng(13, 1, true);
    const out = b.image(png).build();
    // ceil(13/8) = 2 bytes per row * 1 row = 2 bytes payload
    expect(out.length).toBe(8 + 2);
  });

  it('lanza Error si la imagen excede 8000 bytes per row', () => {
    const b = new EscPosBuilder();
    // Crear PNG 65000px ancho excedería el rango del header (uint16) + es absurdo
    expect(() => b.image(makeSolidPng(70_000, 1, true))).toThrow(/demasiado anch/i);
  });
});
