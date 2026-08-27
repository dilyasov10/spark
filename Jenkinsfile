def app

/**
 * Собирается ли сейчас ветка main — от этого зависят стадии сборки образа и
 * деплоя.
 *
 * Раньше стояло `when { branch 'main' }`, но эта проверка смотрит в
 * BRANCH_NAME, а её выставляет только Multibranch Pipeline. В классической
 * Pipeline-джобе переменная пуста, условие ложно всегда, и деплойные стадии
 * молча пропускались даже на зелёной сборке. Поэтому смотрим ещё и в
 * GIT_BRANCH — её заполняет git-плагин, и в джобе с Branch Specifier `*​/main`
 * там будет `origin/main`.
 *
 * Сборка пул-реквеста отсекается явно и первой: ghprb собирает merge-ref
 * (`origin/pr/N/merge`), код в нём ещё не смержен, и в прод ему нельзя
 * независимо от того, что окажется в остальных переменных.
 */
def isMainBuild() {
    if (env.ghprbPullId || env.CHANGE_ID) {
        return false
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
                // любой причине. Печатаем решение и его входные данные, чтобы
                // не гадать по логу.
                echo "BRANCH_NAME=${env.BRANCH_NAME} GIT_BRANCH=${env.GIT_BRANCH} ghprbPullId=${env.ghprbPullId}"
                echo "Деплойные стадии: ${isMainBuild() ? 'выполняются' : 'пропускаются'}"
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
            when { expression { isMainBuild() } }
            steps {
                echo "Build image started..."
                    script {
                        app = docker.build("${env.DOCKER_BUILD_NAME}")
                    }
                echo "Build image finished..."
            }
        }
        stage('Push docker image') {
             when { expression { isMainBuild() } }
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
             when { expression { isMainBuild() } }
             steps {
                 script {
                    sh "docker rmi -f ${env.DOCKER_BUILD_NAME}"
                 }
             }
        }
        stage('Preparing deployment') {
             when { expression { isMainBuild() } }
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
             when { expression { isMainBuild() } }
             steps {
                 withKubeConfig([credentialsId: 'prod-kubernetes']) {
                    sh 'kubectl apply -f deployment.yaml'
                    sh "kubectl rollout status deployment/${env.DEPLOYMENT_NAME} --namespace=${env.NAMESPACE}"
                    sh "kubectl get services -o wide"
                 }
             }
        }
    }
}
