#!/bin/sh
# Recarrega o nginx a cada 6 h para ele pegar o certificado renovado pelo serviço certbot (sem derrubar conexões).
# Roda em segundo plano; o nginx continua sendo o processo principal do contêiner.
( while :; do sleep 6h; nginx -s reload; done ) &
