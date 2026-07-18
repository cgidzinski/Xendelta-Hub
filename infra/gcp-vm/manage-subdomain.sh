#!/bin/bash
# Collapses the manual nginx + certbot subdomain setup documented in
# VM_SETUP.md into single commands. Requires root (nginx config, certbot).
# Not invoked by CI -- this is a human-run tool over SSH.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/templates"
SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") add-proxy <domain> <port> [email] [--force]
  $(basename "$0") add-redirect <domain> <target-url> [email] [--force]
  $(basename "$0") remove <domain>

Examples:
  $(basename "$0") add-proxy demo.xendelta.com 3001 admin@xendelta.com
  $(basename "$0") add-redirect old.xendelta.com https://xendelta.com admin@xendelta.com
  $(basename "$0") remove demo.xendelta.com

Notes:
  - DNS A records must already point the domain at this VM before running
    add-proxy/add-redirect -- that part is not automated here.
  - remove never deletes the TLS certificate; it prints the manual command
    to do that separately.
EOF
  exit 1
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "This command must be run as root (sudo)." >&2
    exit 1
  fi
}

validate_domain() {
  local domain="$1"
  if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
    echo "Invalid domain: $domain" >&2
    exit 1
  fi
}

validate_port() {
  local port="$1"
  if [[ ! "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    echo "Invalid port: $port" >&2
    exit 1
  fi
}

has_flag() {
  local flag="$1"
  shift
  for arg in "$@"; do
    [ "$arg" = "$flag" ] && return 0
  done
  return 1
}

reload_nginx() {
  nginx -t
  systemctl reload nginx
}

check_existing() {
  local domain="$1"
  local force="$2"
  if [ -e "$SITES_AVAILABLE/$domain.conf" ] && [ "$force" != "true" ]; then
    echo "Site config for $domain already exists at $SITES_AVAILABLE/$domain.conf (use --force to overwrite)." >&2
    exit 1
  fi
}

request_cert() {
  local domain="$1"
  local email="$2"
  echo ">>> Requesting TLS certificate for $domain..."
  if [ -n "$email" ]; then
    certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$email" --redirect
  else
    certbot --nginx -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email --redirect
  fi
}

cmd_add_proxy() {
  local domain="${1:-}"
  local port="${2:-}"
  local email="${3:-}"
  [ "$email" = "--force" ] && email=""
  local force="false"
  has_flag "--force" "$@" && force="true"

  [ -z "$domain" ] && usage
  [ -z "$port" ] && usage
  validate_domain "$domain"
  validate_port "$port"
  check_existing "$domain" "$force"

  sed -e "s/__DOMAIN__/$domain/g" -e "s/__PORT__/$port/g" \
    "$TEMPLATES_DIR/proxy.conf.template" > "$SITES_AVAILABLE/$domain.conf"

  ln -sf "$SITES_AVAILABLE/$domain.conf" "$SITES_ENABLED/$domain.conf"
  reload_nginx

  request_cert "$domain" "$email"
  reload_nginx

  echo ">>> $domain is now proxying to localhost:$port with TLS."
}

cmd_add_redirect() {
  local domain="${1:-}"
  local target="${2:-}"
  local email="${3:-}"
  [ "$email" = "--force" ] && email=""
  local force="false"
  has_flag "--force" "$@" && force="true"

  [ -z "$domain" ] && usage
  [ -z "$target" ] && usage
  validate_domain "$domain"
  check_existing "$domain" "$force"

  # Escape sed-special characters (/, &) in the target URL before substitution.
  local escaped_target
  escaped_target=$(printf '%s\n' "$target" | sed -e 's/[\/&]/\\&/g')

  sed -e "s/__DOMAIN__/$domain/g" -e "s/__TARGET__/$escaped_target/g" \
    "$TEMPLATES_DIR/redirect.conf.template" > "$SITES_AVAILABLE/$domain.conf"

  ln -sf "$SITES_AVAILABLE/$domain.conf" "$SITES_ENABLED/$domain.conf"
  reload_nginx

  request_cert "$domain" "$email"
  reload_nginx

  echo ">>> $domain now redirects to $target with TLS."
}

cmd_remove() {
  local domain="${1:-}"
  [ -z "$domain" ] && usage
  validate_domain "$domain"

  rm -f "$SITES_ENABLED/$domain.conf"
  rm -f "$SITES_AVAILABLE/$domain.conf"
  reload_nginx

  echo ">>> Removed nginx config for $domain."
  echo ">>> TLS certificate was intentionally left in place. To delete it too, run:"
  echo "    sudo certbot delete --cert-name $domain"
}

main() {
  require_root
  local cmd="${1:-}"
  [ -z "$cmd" ] && usage
  shift

  case "$cmd" in
    add-proxy) cmd_add_proxy "$@" ;;
    add-redirect) cmd_add_redirect "$@" ;;
    remove) cmd_remove "$@" ;;
    *) usage ;;
  esac
}

main "$@"
