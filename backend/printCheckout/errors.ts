/** Error HTTP modul checkout buku cetak: `message` ditampilkan apa adanya oleh checkout (Bahasa Indonesia). */
export class PrintCheckoutError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export const fail = (status: number, code: string, message: string) => new PrintCheckoutError(status, code, message);
