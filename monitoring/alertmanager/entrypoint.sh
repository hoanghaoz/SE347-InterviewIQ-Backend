#!/bin/sh

set -eu

: "${SMTP_USERNAME:?SMTP_USERNAME is required}"
: "${SMTP_PASSWORD:?SMTP_PASSWORD is required}"

alert_email_to="${ALERT_EMAIL_TO:-$SMTP_USERNAME}"
template_file='/etc/alertmanager/alertmanager.yml.template'
config_file='/tmp/alertmanager.yml'
password_file='/tmp/alertmanager-smtp-password'

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[\\&|]/\\&/g'
}

smtp_username="$(escape_sed_replacement "$SMTP_USERNAME")"
alert_email_to="$(escape_sed_replacement "$alert_email_to")"

umask 077
printf '%s' "$SMTP_PASSWORD" > "$password_file"
sed \
  -e "s|__SMTP_USERNAME__|$smtp_username|g" \
  -e "s|__ALERT_EMAIL_TO__|$alert_email_to|g" \
  "$template_file" > "$config_file"

exec /bin/alertmanager \
  --config.file="$config_file" \
  --storage.path=/alertmanager \
  --web.listen-address=:9093 \
  --cluster.listen-address=
