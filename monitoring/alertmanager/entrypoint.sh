#!/bin/sh

set -eu

: "${SMTP_USERNAME:?SMTP_USERNAME is required}"
: "${SMTP_PASSWORD:?SMTP_PASSWORD is required}"

alert_email_to="${ALERT_EMAIL_TO:-$SMTP_USERNAME}"
smtp_smarthost="${SMTP_SMARTHOST:-smtp.gmail.com:587}"
smtp_from="${SMTP_FROM:-$SMTP_USERNAME}"
template_file='/etc/alertmanager/alertmanager.yml.template'
config_file='/tmp/alertmanager.yml'
password_file='/tmp/alertmanager-smtp-password'

validate_single_line() {
  if [ "$(printf '%s' "$2" | tr -d '\r\n')" != "$2" ]; then
    printf '%s must be a single line\n' "$1" >&2
    exit 1
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed "s/'/''/g" | sed 's/[\\&|]/\\&/g'
}

validate_single_line SMTP_SMARTHOST "$smtp_smarthost"
validate_single_line SMTP_FROM "$smtp_from"
validate_single_line SMTP_USERNAME "$SMTP_USERNAME"
validate_single_line ALERT_EMAIL_TO "$alert_email_to"

smtp_smarthost="$(escape_sed_replacement "$smtp_smarthost")"
smtp_from="$(escape_sed_replacement "$smtp_from")"
smtp_username="$(escape_sed_replacement "$SMTP_USERNAME")"
alert_email_to="$(escape_sed_replacement "$alert_email_to")"

umask 077
printf '%s' "$SMTP_PASSWORD" > "$password_file"
sed \
  -e "s|__SMTP_SMARTHOST__|$smtp_smarthost|g" \
  -e "s|__SMTP_FROM__|$smtp_from|g" \
  -e "s|__SMTP_USERNAME__|$smtp_username|g" \
  -e "s|__ALERT_EMAIL_TO__|$alert_email_to|g" \
  "$template_file" > "$config_file"

if [ "${1:-}" = '--check' ]; then
  exec /bin/amtool check-config "$config_file"
fi

exec /bin/alertmanager \
  --config.file="$config_file" \
  --storage.path=/alertmanager \
  --web.listen-address=:9093 \
  --cluster.listen-address=
