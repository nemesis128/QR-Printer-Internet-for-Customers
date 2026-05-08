import { renderVoucher, type VoucherPayload } from '../templates/voucher.js';

export type PrintUseCase = 'voucher';

export function renderPrintBytes(
  useCase: PrintUseCase,
  payload: object,
  widthChars: 32 | 48
): Uint8Array {
  switch (useCase) {
    case 'voucher':
      return renderVoucher(payload as VoucherPayload, widthChars);
    default: {
      const exhaustive: never = useCase;
      throw new Error(`renderPrintBytes: use_case desconocido: ${String(exhaustive)}`);
    }
  }
}
