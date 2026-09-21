const configuredUsername = process.env.INSTAGRAM_USERNAME?.replace(/^@/, '') || 'silentforward';

if (!/^[a-z0-9._]{1,30}$/i.test(configuredUsername)) {
  throw new Error('INSTAGRAM_USERNAME trebuie să fie un nume de utilizator Instagram valid.');
}

export const brandUsername = configuredUsername;
export const brandName = (process.env.BRAND_NAME?.trim() || 'Silent Forward').slice(0, 60);
