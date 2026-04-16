export function validateFileMagicNumber(headerBuffer: Buffer, mimeType: string, filename: string): boolean {
  if (headerBuffer.length < 8) return false; // Too small

  // Convert buffer to hex signature
  const hex = headerBuffer.toString('hex').toUpperCase();

  // Allowed signatures mapping
  // PDF: 25504446
  // PNG: 89504E47
  // JPEG: FFD8FF
  // ZIP/DOCX/XLSX: 504B0304
  // OLE/DOC: D0CF11E0A1B11AE1
  // HEIC: starts with 'ftyp' at offset 4 => byte 4,5,6,7 are 66747970
  
  if (hex.startsWith('25504446')) return true; // PDF
  if (hex.startsWith('89504E47')) return true; // PNG
  if (hex.startsWith('FFD8FF')) return true; // JPEG
  if (hex.startsWith('504B0304')) return true; // Modern Office (DOCX, XLSX, PPTX, etc)
  if (hex.startsWith('D0CF11E0A1B11AE1')) return true; // Legacy Office (DOC, XLS, PPT)
  
  const isHeic = headerBuffer.length >= 12 && headerBuffer.slice(4, 8).toString('utf-8') === 'ftyp';
  if (isHeic) return true;

  // text/plain typically doesn't have a magic number, so we just check the mime type
  if (mimeType === 'text/plain' && filename.toLowerCase().endsWith('.txt')) {
    return true; // We accept simple text files
  }
  
  // DWG files usually start with "AC" followed by version (e.g. AC1027)
  if (headerBuffer.slice(0, 2).toString('utf-8') === 'AC') {
    return true;
  }

  // Not recognized
  return false;
}
