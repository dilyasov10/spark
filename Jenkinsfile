def app

/**
 * Едет ли из этой сборки деплой в прод.
 *
 * Раньше стояло `when { branch 'main' }`. Эта проверка смотрит в BRANCH_NAME,
 * а её выставляет только Multibranch Pipeline — в остальных типах джоб
 * переменная пуста, условие ложно всегда, и деплойные стадии пропускались даже
 * на полностью зелёном прогоне.
 *
 * Единственная джоба проекта — `prd-nest-backend-pull-request` на плагине
 * ghprb: она собирает merge-ref пул-реквеста (`origin/pr/N/merge`), то есть
 * содержимое main плюс коммиты PR. Поэтому решение принимаем по ветке, в
 * которую нацелен PR: `ghprbTargetBranch`. Джобы, собирающей main напрямую,
 * в Jenkins нет и завести её некому.
 *
 * Ветки BRANCH_NAME и GIT_BRANCH проверяются следом — чтобы пайплайн отработал
 * без правок, если джоба на main всё-таки появится, хоть multibranch, хоть
 * обычная с Branch Specifier `*​/main`.
 */
def isDeployBuild() {
    if (env.ghprbTargetBranch) {
        return env.ghprbTargetBranch == 'main'
    }

    return env.BRANCH_NAME == 'main' || (env.GIT_BRANCH ?: '') ==~ /(origin\/)?main/
}

pipeline {
    agent any
    environment {
        ENV_TYPE = "production"
        PORT = 4401
        NAMESPACE = "sprak-by-ru"
        REGISTRY_HOSTNAME = "alhmdd2405"
        PROJECT = "nest-backend"
        REGISTRY = "registry.hub.docker.com"
        DEPLOYMENT_NAME = "nest-backend-deployment"
        IMAGE_NAME = "${env.BUILD_ID}_${env.ENV_TYPE}_${env.GIT_COMMIT}"
        DOCKER_BUILD_NAME = "${env.REGISTRY_HOSTNAME}/${env.PROJECT}:${env.IMAGE_NAME}"
        // corepack из образа агента может быть старше ключей, которыми подписаны
        // свежие релизы pnpm; переменная гасит его интерактивный вопрос, иначе
        // сборка зависнет на приглашении.
        COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
    }

    stages {
        stage('Clone repository') {
            steps {
                checkout scm
                // Пропуск деплойных стадий выглядит в Stage View одинаково при
                // любой причине — печатаем решение и его входные данные, чтобы
                // не разбирать это по логу заново.
                echo "ghprbTargetBranch=${env.ghprbTargetBranch} BRANCH_NAME=${env.BRANCH_NAME} GIT_BRANCH=${env.GIT_BRANCH}"
                echo "Деплойные стадии: ${isDeployBuild() ? 'выполняются' : 'пропускаются'}"
            }
        }
        stage('Install dependencies') {
            steps {
                script {
                    // Клиент Prisma генерируется в src/generated и в git не
                    // коммитится — без генерации тесты падают на импорте.
                    // `prisma generate` в базу не ходит, URL нужен ему только
                    // формально.
                    sh '''
                       export NVM_DIR="$HOME/.nvm"
                       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                       nvm use --lts
                       npm install -g corepack@latest
                       corepack enable
                       pnpm install --frozen-lockfile
                       DIRECT_URL="postgresql://build:build@localhost:5432/build" pnpm db:generate
                    '''
                }
            }
        }
        stage('Unit tests') {
            steps {
                script {
                    sh '''
                       export NVM_DIR="$HOME/.nvm"
                       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                       nvm use --lts
                       pnpm test
                    '''
                }
            }
        }
        stage('e2e tests') {
            // Переменные окружения стадии не нужны: ни один e2e-тест в базу не
            // ходит, PrismaService везде подменяется заглушкой. Живого
            // DATABASE_URL здесь стоял credential 'neon-database-url', но
            // биндинг вычисляется до тела стадии — при отсутствии credential в
            // Jenkins сборка обрывалась с `ERROR: neon-database-url`, не
            // запустив ни одной команды. Вернуть, когда появятся тесты,
            // которым нужна настоящая БД.
            steps {
                script {
                    sh '''
                       export NVM_DIR="$HOME/.nvm"
                       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                       nvm use --lts
                       pnpm test:e2e
                    '''
                }
            }
        }
        stage('Build docker image') {
            when { expression { isDeployBuild() } }
            steps {
                echo "Build image started..."
                    script {
                        app = docker.build("${env.DOCKER_BUILD_NAME}")
                    }
                echo "Build image finished..."
            }
        }
        stage('Push docker image') {
             when { expression { isDeployBuild() } }
             steps {
                 echo "Push image started..."
                     script {
                        docker.withRegistry("https://${env.REGISTRY}", 'sprak-by-ru') {
                            app.push("${env.IMAGE_NAME}")
                        }
                     }
                 echo "Push image finished..."
             }
       }
       stage('Delete image local') {
             when { expression { isDeployBuild() } }
             steps {
                 script {
                    sh "docker rmi -f ${env.DOCKER_BUILD_NAME}"
                 }
             }
        }
        stage('Preparing deployment') {
             when { expression { isDeployBuild() } }
             steps {
                 echo "Preparing started..."
                     sh 'ls -ltr'
                     sh 'pwd'
                     sh "chmod +x preparingDeploy.sh"
                     sh "./preparingDeploy.sh ${env.REGISTRY_HOSTNAME} ${env.PROJECT} ${env.IMAGE_NAME} ${env.DEPLOYMENT_NAME} ${env.PORT} ${env.NAMESPACE}"
                     sh "cat deployment.yaml"
             }
        }
        stage('Deploy to Kubernetes') {
             when { expression { isDeployBuild() } }
             steps {
                 withKubeConfig([credentialsId: 'prod-kubernetes']) {
                    sh 'kubectl apply -f deployment.yaml'

                    // `rollout status` при неподнявшемся поде отваливается по
                    // таймауту с `exceeded its progress deadline` — причину он
                    // не показывает. Ловим падение и выводим состояние пода:
                    // CrashLoopBackOff (нет Secret, приложение упало на старте)
                    // и ImagePullBackOff (образ недоступен) выглядят в статусе
                    // стадии одинаково, а лечатся по-разному.
                    script {
                        try {
                            sh "kubectl rollout status deployment/${env.DEPLOYMENT_NAME} --namespace=${env.NAMESPACE} --timeout=120s"
                        } catch (rolloutError) {
                            sh "kubectl get pods -n ${env.NAMESPACE} -o wide"
                            sh "kubectl describe deployment/${env.DEPLOYMENT_NAME} -n ${env.NAMESPACE}"
                            sh "kubectl describe pods -l project=${env.PROJECT} -n ${env.NAMESPACE}"
                            // Логи есть не всегда: при ImagePullBackOff
                            // контейнер не стартовал, и команда вернёт ошибку —
                            // она не должна перебивать исходную.
                            sh "kubectl logs -l project=${env.PROJECT} -n ${env.NAMESPACE} --tail=100 --all-containers || true"
                            sh "kubectl get secret nest-backend-secrets -n ${env.NAMESPACE} || true"

                            throw rolloutError
                        }
                    }

                    sh "kubectl get services -n ${env.NAMESPACE} -o wide"
                 }
             }
        }
    }
}
