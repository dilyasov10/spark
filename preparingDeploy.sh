#!/bin/bash
#
# Подставляет параметры сборки в манифест сервиса.
#
# Читает `apps/<service>/deployment.yaml` и пишет рядом
# `apps/<service>/deployment.generated.yaml` — именно его применяет `kubectl`.
# Исходный манифест не трогается: правка на месте требовала откатывать файл
# после сборки, а `git checkout` в рабочей копии с незакоммиченными изменениями
# сносит и их тоже. Сгенерированный файл лежит в .gitignore.
#
# Один скрипт на все сервисы: раньше копия лежала в каждом каталоге приложения
# и правки расходились между ними.
#
# Использование:
#   ./preparingDeploy.sh <service> <registry_host> <project> <tag> \
#                        <deployment_name> <port> <namespace>
set -euo pipefail

if [ "$#" -ne 7 ]; then
  echo "Ожидалось 7 аргументов, получено $#" >&2
  echo "Использование: $0 <service> <registry_host> <project> <tag> <deployment_name> <port> <namespace>" >&2
  exit 1
fi

service=$1
registry_hostname=$2
project=$3
tag_version=$4
deployment_name=$5
port_container=$6
namespace=$7

source_manifest="./apps/${service}/deployment.yaml"
target_manifest="./apps/${service}/deployment.generated.yaml"

if [ ! -f "$source_manifest" ]; then
  echo "Манифест не найден: $source_manifest" >&2
  exit 1
fi

# Плейсхолдеры подобраны так, чтобы ни один не был подстрокой другого, —
# порядок подстановок на результат не влияет. Проверка ниже страхует от
# опечатки и от нового плейсхолдера, который это правило нарушит.
#
# Разделитель `|` вместо `/`: в имени образа встречаются слеши.
sed \
  -e "s|REGISTRY_HOSTNAME|${registry_hostname}|g" \
  -e "s|DEPLOYMENT_NAME|${deployment_name}|g" \
  -e "s|PORT_CONTAINER|${port_container}|g" \
  -e "s|TAG_VERSION|${tag_version}|g" \
  -e "s|NAMESPACE|${namespace}|g" \
  -e "s|PROJECT|${project}|g" \
  "$source_manifest" > "$target_manifest"

# Незаменённый плейсхолдер даёт манифест, который `kubectl apply` примет как
# валидный, а под потом не поднимется — дешевле оборвать сборку здесь.
if grep -nE 'REGISTRY_HOSTNAME|TAG_VERSION|DEPLOYMENT_NAME|PORT_CONTAINER|NAMESPACE|PROJECT' "$target_manifest"; then
  echo "В $target_manifest остались незаменённые плейсхолдеры" >&2
  exit 1
fi

echo "Манифест $target_manifest подготовлен"
