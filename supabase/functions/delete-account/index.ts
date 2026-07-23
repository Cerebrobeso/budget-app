import { createClient } from 'npm:@supabase/supabase-js@2';

// Il browser invia una richiesta preflight OPTIONS prima di ogni chiamata con header
// custom (Authorization): senza questi header ogni risposta verrebbe bloccata dal browser
// per CORS, anche se la funzione ha eseguito correttamente.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cancella tutte le righe dell'utente chiamante e l'utente stesso da Supabase Auth.
// Richiede la service-role key: per questo gira come Edge Function e non lato client.
// SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY sono iniettate di default
// dal runtime delle Edge Function, non vanno impostate a mano.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const tables = ['transactions', 'categories', 'subcategory_overlays', 'assets', 'recurring_rules'];
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq('user_id', user.id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    return new Response(JSON.stringify({ error: deleteUserError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
