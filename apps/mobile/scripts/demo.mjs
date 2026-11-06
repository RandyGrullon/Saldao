// La app con los datos de ejemplo en memoria, sin Supabase: `npm run demo` (y `npm run demo -- --web` para el navegador).
import { spawn } from 'node:child_process';

const p = spawn('npx', ['expo', 'start', '--clear', ...process.argv.slice(2)], { stdio: 'inherit', shell: true, env: { ...process.env, EXPO_PUBLIC_DEMO: '1' } });
p.on('exit', code => process.exit(code ?? 0));
