import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAdminCookie, verifyPassword } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url, platform }) => ({
  configured: Boolean(platform?.env?.DASHBOARD_PASSWORD && platform?.env?.APP_ENCRYPTION_KEY),
  next: url.searchParams.get('next') || '/'
});

export const actions: Actions = {
  default: async ({ request, cookies, platform, url }) => {
    const env = platform?.env;
    const expected = env?.DASHBOARD_PASSWORD as string | undefined;
    const encryptionKey = env?.APP_ENCRYPTION_KEY as string | undefined;
    if (!expected || !encryptionKey) return fail(503, { error: 'Dashboard password is not configured.' });

    const form = await request.formData();
    const supplied = String(form.get('password') || '');
    if (!verifyPassword(supplied, expected)) return fail(400, { error: 'Pogrešna lozinka.' });

    cookies.set('tp_admin', await createAdminCookie(encryptionKey), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    });

    const next = url.searchParams.get('next') || '/';
    throw redirect(303, next.startsWith('/') ? next : '/');
  }
};
