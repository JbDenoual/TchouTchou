import { supabase } from './supabaseClient.js';
import { outboxRemoveByTripId } from './db.js';

export function newTripId() {
  return crypto.randomUUID();
}

export function newPingId() {
  return crypto.randomUUID();
}

export async function listTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data;
}

// PostgREST plafonne les résultats à 1000 lignes par requête par défaut, sans
// erreur ni avertissement. Pour un trajet long (plusieurs heures à un ping
// toutes les 15s, ça dépasse vite 1000), il faut paginer explicitement pour
// tout récupérer.
const PAGE_SIZE = 1000;

export async function getTripPings(tripId) {
  let rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('pings')
      .select('*')
      .eq('trip_id', tripId)
      .order('sent_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows.map(fromRow);
}

export async function getTrip(tripId) {
  const { data, error } = await supabase.from('trips').select('*').eq('id', tripId).single();
  if (error) throw error;
  return data;
}

// La suppression du trajet entraîne celle de ses pings (on delete cascade en base).
// On purge d'abord la file locale en attente : sinon une synchro tardive
// (ex: session orpheline après rechargement du navigateur) peut ré-uploader
// le trajet ou ses pings après coup et le faire réapparaître.
export async function deleteTrip(tripId) {
  await outboxRemoveByTripId(tripId);
  const { error } = await supabase.from('trips').delete().eq('id', tripId);
  if (error) throw error;
}

// Convertit une ligne Supabase (snake_case) vers le format utilisé côté app.
function fromRow(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    sentAt: row.sent_at,
    resolvedAt: row.resolved_at,
    startLat: row.start_lat,
    startLng: row.start_lng,
    endLat: row.end_lat,
    endLng: row.end_lng,
    elapsedMs: row.elapsed_ms,
    success: row.success,
  };
}
