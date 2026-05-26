# Port map for dual local Supabase (primary vs standby). Sourced by ensure/probe scripts.
# Primary: li-cursor-agents/ — API 54321, DB 54322
# Standby: li-cursor-agents-standby/ — API 54421, DB 54422

li_supabase_primary_api_port() { echo "${LI_SUPABASE_PRIMARY_API_PORT:-54321}"; }
li_supabase_primary_db_port() { echo "${LI_SUPABASE_PRIMARY_DB_PORT:-54322}"; }
li_supabase_standby_api_port() { echo "${LI_SUPABASE_STANDBY_API_PORT:-54421}"; }
li_supabase_standby_db_port() { echo "${LI_SUPABASE_STANDBY_DB_PORT:-54422}"; }

li_supabase_primary_url() {
  echo "http://127.0.0.1:$(li_supabase_primary_api_port)"
}

li_supabase_standby_url() {
  echo "http://127.0.0.1:$(li_supabase_standby_api_port)"
}

li_supabase_standby_root() {
  local primary_root="$1"
  echo "${LI_SUPABASE_STANDBY_ROOT:-$(dirname "$primary_root")/li-cursor-agents-standby}"
}

# Patch supabase/config.toml in-place for standby ports (idempotent-ish).
li_supabase_patch_standby_config() {
  local cfg="$1"
  [[ -f "$cfg" ]] || return 1
  local api db shadow studio inbucket
  api="$(li_supabase_standby_api_port)"
  db="$(li_supabase_standby_db_port)"
  shadow=$((db - 2))
  studio=$((api + 2))
  inbucket=$((api + 3))
  sed -i \
    -e "s/^project_id = .*/project_id = \"li-cursor-agents-standby\"/" \
    -e "s/^port = 54321/port = ${api}/" \
    -e "s/^port = 54421/port = ${api}/" \
    -e "s/^port = 54322/port = ${db}/" \
    -e "s/^port = 54422/port = ${db}/" \
    -e "s/^shadow_port = .*/shadow_port = ${shadow}/" \
    -e "s/^port = 54323/port = ${studio}/" \
    -e "s/^port = 54423/port = ${studio}/" \
    -e "s/^port = 54324/port = ${inbucket}/" \
    -e "s/^port = 54424/port = ${inbucket}/" \
    "$cfg"
}
