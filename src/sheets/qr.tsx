import { moneyT, payQrText, qrPath, short } from '@saldao/core';
import { Icon } from '../ui/icons';
import { useS } from '../ui/kit';
import { SheetHead, useNav } from '../ui/nav';

/** Tu código para cobrar: tus datos de pago (y el monto, si viene). Cualquier cámara lo lee y copia el texto. */
export function QrSheet({ amount, from }: { amount?: number; from?: string }) {
  const s = useS(), nav = useNav(), me = s.profiles[s.me];
  if (!me.payout) return (
    <>
      <SheetHead title="Tu código para cobrar" />
      <div className="scroll sheet-scroll pad">
        <p className="finding">Primero pon dónde te pagan.</p>
        <p className="note">En Cuenta, en «Dónde te pagan», escribe tu banco, el tipo de cuenta y el número. El código los lleva para que te transfieran sin escribirlos.</p>
        <button className="btn primary block tap" onClick={() => { nav.closeSheet(); nav.setTab('account'); }}>Ir a Cuenta</button>
      </div>
    </>
  );
  const text = payQrText(s, amount), q = qrPath(text);
  return (
    <>
      <SheetHead title="Tu código para cobrar" />
      <div className="scroll sheet-scroll pad">
        {from && amount ? <p className="note center">Para que {short(s, from)} te pague {moneyT(amount)}.</p> : null}
        <div className="qr" role="img" aria-label="Código QR con tus datos de cobro">
          <svg viewBox={`-2 -2 ${q.size + 4} ${q.size + 4}`} shapeRendering="crispEdges"><rect x="-2" y="-2" width={q.size + 4} height={q.size + 4} fill="#fff" /><path d={q.d} fill="#0e0f13" /></svg>
        </div>
        <p className="qr-text" style={{ userSelect: 'text' }}>{text}</p>
        <button className="btn tap" onClick={() => navigator.clipboard.writeText(text).then(() => nav.toast('Datos copiados'), () => nav.toast('No se pudo copiar'))}>
          <Icon n="copy" sm />Copiar los datos</button>
      </div>
    </>
  );
}
