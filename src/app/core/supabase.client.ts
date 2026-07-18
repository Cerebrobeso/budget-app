import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** L'URL fornito può includere il suffisso /rest/v1/: createClient vuole l'URL base del progetto. */
const projectUrl = environment.supabaseUrl.replace(/\/rest\/v1\/?$/, '');

export const supabase = createClient(projectUrl, environment.supabaseAnonKey);
