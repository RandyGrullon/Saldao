import { Redirect } from 'expo-router';

// Un enlace a una pantalla que no existe (o un saldao:// viejo): a Inicio.
export default function NotFound() {
  return <Redirect href="/" />;
}
