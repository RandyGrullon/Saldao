# Copia a Vercel (producción y desarrollo) las variables de Supabase que están en .env.local, sin mostrarlas.
# Uso: .\scripts\vercel-env.ps1   (después de `npx vercel login` y `npx vercel link`)
$vars = @{}
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*(VITE_[A-Z_]+)\s*=\s*(\S+)\s*$') { $vars[$Matches[1]] = $Matches[2] }
}
foreach ($name in 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY') {
  if (-not $vars[$name]) { Write-Host "Falta $name en .env.local"; exit 1 }
  foreach ($target in 'production', 'development') {
    npx vercel env rm $name $target --yes *> $null   # por si ya existía
    $vars[$name] | npx vercel env add $name $target *> $null
  }
  Write-Host "$name guardada en Vercel"
}
