#!/bin/sh
set -eu

php artisan config:clear

until php -r '
$dsn = sprintf(
    "mysql:host=%s;port=%s;dbname=%s",
    getenv("DB_HOST"),
    getenv("DB_PORT"),
    getenv("DB_DATABASE")
);
new PDO($dsn, getenv("DB_USERNAME"), getenv("DB_PASSWORD"));
' >/dev/null 2>&1; do
    echo "Waiting for MySQL..."
    sleep 2
done

php artisan migrate --force
php artisan db:seed --force

exec "$@"
