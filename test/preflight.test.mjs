import test from 'node:test'
import assert from 'node:assert/strict'
import { validateWorkerEnvironment } from '../server/preflight.mjs'

const validEnvironment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_current',
  CLOUDINARY_CLOUD_NAME: 'cloud',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
  INSTAGRAM_ACCESS_TOKEN: 'token',
  INSTAGRAM_ACCOUNT_ID: 'account',
}

test('worker preflight accepts the current Supabase secret format', () => {
  assert.equal(validateWorkerEnvironment(validEnvironment).supabaseKeyFormat, 'current')
})

test('worker preflight rejects legacy Supabase JWT keys', () => {
  assert.throws(() => validateWorkerEnvironment({ ...validEnvironment, SUPABASE_SECRET_KEY: 'eyJlegacy' }), /cheie Supabase veche/)
})

test('remote scheduler requires its own secret', () => {
  assert.throws(() => validateWorkerEnvironment(validEnvironment, { scheduler: true }), /SCHEDULER_SECRET/)
  assert.equal(validateWorkerEnvironment({ ...validEnvironment, SCHEDULER_SECRET: 'scheduler-secret' }, { scheduler: true }).schedulerProtected, true)
})
