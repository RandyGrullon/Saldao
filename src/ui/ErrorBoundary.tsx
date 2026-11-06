import { Component, type ReactNode } from 'react';
import { tr } from '@saldao/core';

/** Si algo de la pantalla se rompe, un aviso claro en vez de la pantalla en blanco (sin detalles internos). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error(e); }
  render() {
    if (!this.state.failed) return this.props.children;
    document.getElementById('splash')?.remove();
    return (
      <main className="gate">
        <div><h1>{tr("Algo se trabó")}</h1><p className="lead">{tr("Tus cuentas están guardadas. Vuelve a abrir la app y sigue donde ibas.")}</p></div>
        <button className="btn primary block tap" onClick={() => location.reload()}>{tr("Volver a abrir")}</button>
      </main>
    );
  }
}
