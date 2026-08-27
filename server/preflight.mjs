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
  const required = environment.REMOTE_SCHEDULER === 'true'
    ? [...workerSecrets, 'SCHEDULER_SECRET']
    : workerSecrets
  const missing = required.filter((name) => !environment[name])
  if (missing.length) throw new Error(`Lipsesc variabilele remote: ${missing.join(', ')}`)
  if (!environment.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
    throw new Error('Workerul remote folosește o cheie Supabase veche. Actualizează SUPABASE_SECRET_KEY cu cheia sb_secret_ curentă.')
  }
  return { supabaseKeyFormat: 'current', services: ['supabase', 'cloudinary', 'instagram'], schedulerProtected: Boolean(environment.SCHEDULER_SECRET) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateWorkerEnvironment()
  console.log(`[preflight] Configurație validă: ${result.services.join(', ')}; Supabase key format: ${result.supabaseKeyFormat}.`)
}
