// Exportar: el CSV para Excel y el informe en PDF, con «Compartir» del teléfono (WhatsApp, correo, Archivos…).
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function shareCsv(name: string, text: string) {
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = `${name}.csv`; a.click();
    return;
  }
  const f = new File(Paths.cache, `${name}.csv`);
  await f.write(text);
  await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar a Excel', UTI: 'public.comma-separated-values-text' });
}

export async function sharePdf(html: string) {
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir el PDF', UTI: 'com.adobe.pdf' });
}
