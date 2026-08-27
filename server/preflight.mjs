import 'dotenv/config'

const workerSecrets = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_ACCOUNT_ID',
]

export function validateWorkerEnvironment(environment = process.env) {
  const missing = workerSecrets.filter((name) => !environment[name])
  if (missing.length) throw new Error(`Lipsesc variabilele remote: ${missing.join(', ')}`)
  if (!environment.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
    throw new Error('GitHub Actions folosește o cheie Supabase veche. Actualizează secretul SUPABASE_SECRET_KEY cu cheia sb_secret_ curentă.')
  }
  return { supabaseKeyFormat: 'current', services: ['supabase', 'cloudinary', 'instagram'] }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateWorkerEnvironment()
  console.log(`[preflight] Configurație validă: ${result.services.join(', ')}; Supabase key format: ${result.supabaseKeyFormat}.`)
}
