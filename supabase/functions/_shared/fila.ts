import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
export const cors = {
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const text = (v: unknown) => String(v ?? '').trim();
export function json(body: unknown, status = 200) {
 return new Response(JSON.stringify(body), {status, headers: {...cors, 'Content-Type': 'application/json'}});
}
export function admin() {
 return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
 {auth: {persistSession: false, autoRefreshToken: false}});
}
export async function authenticate(req: Request, db: ReturnType<typeof admin>) {
 const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
 if (!token) return null;
 const {data, error} = await db.auth.getUser(token);
 const domains = (Deno.env.get('CERTIFICADOS_DOMINIOS_PERMITIDOS') || 'animaeducacao.com.br').split(',').map(x => x.trim().toLowerCase());
 if (error || !data.user?.email_confirmed_at || !domains.includes(data.user.email?.toLowerCase().split('@')[1] || '')) return null;
 return data.user;
}
export async function rpc(db: ReturnType<typeof admin>, name: string, args: Record<string, unknown>) {
 const {data,error} = await db.rpc(name,args);
 if (error) throw new Error(error.message);
 return data;
}
